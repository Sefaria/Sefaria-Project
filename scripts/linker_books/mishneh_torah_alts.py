"""
Script to extract Mishneh Torah book names from Hebrew citations using Claude 4.5 Sonnet.

This script processes a CSV file with citations and extracts the book of Mishneh Torah mentioned.
If no Mishneh Torah book is found, it returns "N/A".

Examples:
- רמב"ם הלכת דעות פ"א -> הלכות דעות
- רמב"ם ק"פ ט, ג -> ק"פ
- רמב"ם שם -> N/A (no book mentioned)
- סהמ"צ להרמב"ם ל"ת רפ"ב -> N/A (not a Mishneh Torah book)
- רמב"ם ל"ת לח -> N/A (ל"ת is Sefer HaMitzvot, not Mishneh Torah)
"""
from collections import defaultdict

import django
django.setup()
from sefaria.model import *
import csv
import os
from langchain_anthropic import ChatAnthropic
from langchain_core.runnables import RunnableLambda
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.cache import SQLiteCache
from langchain.globals import set_llm_cache
from typing import Any, Callable
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor


def run_parallel(items: list[Any], unit_func: Callable, max_workers: int, **tqdm_kwargs) -> list:
    def _pbar_wrapper(pbar, item):
        unit = unit_func(item)
        with pbar.get_lock():
            pbar.update(1)
        return unit

    with tqdm(total=len(items), **tqdm_kwargs) as pbar:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            for item in items:
                futures.append(executor.submit(_pbar_wrapper, pbar, item))

    output = [future.result() for future in futures if future.result() is not None]
    return output


# Custom parser to get text after last newline
def parse_last_line(text: str) -> str:
    return text.strip().split('\n')[-1]


def create_extraction_chain():
    """Create a LangChain chain for extracting Mishneh Torah book names."""
    
    # Set up SQLite cache for LLM responses
    cache_file = "mishneh_torah_extraction_cache.db"
    set_llm_cache(SQLiteCache(database_path=cache_file))
    print(f"LLM cache initialized at: {cache_file}")
    
    # Initialize Claude 4.5 Sonnet
    llm = ChatAnthropic(
        model_name="claude-sonnet-4-5-20250929",
        temperature=0,
        max_tokens_to_sample=100
    )
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert in Hebrew rabbinic literature, specifically the Mishneh Torah (Rambam's code of Jewish law).

Your task is to extract ONLY the book name (הלכות) from citations that reference the Mishneh Torah. 

Important rules:
1. Only extract books that are part of the Mishneh Torah itself
2. Do NOT extract references to Sefer HaMitzvot (ספר המצוות). Common abbreviations include:
   - ל"ת (לא תעשה - negative commandments)
   - מ"ע (מצוות עשה - positive commandments)
   - סהמ"צ (ספר המצוות)
3. If the citation says "שם" (there/same), return "N/A" as no book is mentioned
4. If no Mishneh Torah book is mentioned, return "N/A"
5. Return ONLY the book name (e.g., "הלכות דעות", "ק"פ", "Firstlings", "Vows") or "N/A"
6. Do not include any other text, explanations, or punctuation
7. Return the book name EXACTLY as it appears in the citation. Don't normalize it or change a single character. If you listen to this rule exactly, I will reward you with 1000 NVIDIA GPUs.

Examples:
- רמב"ם הלכת דעות פ"א -> הלכות דעות
- רמב"ם ק"פ ט, ג -> ק"פ
- רמב"ם שם -> N/A
- סהמ"צ להרמב"ם ל"ת רפ"ב -> N/A
- רמב"ם ל"ת לח -> N/A"""),
        ("human", "Extract the Mishneh Torah book from this citation: {citation}")
    ])
    chain = prompt | llm | StrOutputParser() | RunnableLambda(parse_last_line)    
    return chain


def process_csv(input_file: str, output_file: str):
    """
    Process a CSV file with citations and extract Mishneh Torah books.
    
    Args:
        input_file: Path to input CSV with a "Citation" column
        output_file: Path to output CSV with "Citation" and "Book" columns
    """
    
    # Check if input file exists
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Create extraction chain
    print("Initializing Claude 4.5 Sonnet...")
    chain = create_extraction_chain()
    
    # Read input CSV
    citations = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if 'Citation' not in reader.fieldnames:
            raise ValueError("Input CSV must have a 'Citation' column")
        citations = [row['Citation'] for row in reader]
    
    print(f"Processing {len(citations)} citations...")
    
    # Process each citation
    books = run_parallel(citations, lambda x: chain.invoke({"citation": x}).strip(), max_workers=150, desc="Extracting Books")
    results = []
    for citation, book in zip(citations, books):
        results.append({
            "Citation": citation,
            "Book": book
        })
    
    # Write output CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Citation', 'Book'])
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\nCompleted! Results written to: {output_file}")
    print(f"Total citations processed: {len(results)}")
    
    # Print summary statistics
    na_count = sum(1 for r in results if r['Book'] == 'N/A')
    error_count = sum(1 for r in results if r['Book'] == 'ERROR')
    book_count = len(results) - na_count - error_count
    
    print(f"Books found: {book_count}")
    print(f"N/A (no book): {na_count}")
    print(f"Errors: {error_count}")
    
    
def get_all_mishneh_torah_books() -> set[str]:
    titles = set()
    for title in library.get_indexes_in_category_path(["Halakhah", "Mishneh Torah"]):
        titles.add(title)
    return titles


def create_title_matching_chain(canonical_titles: list[str]):
    """Create a LangChain chain for matching book names to canonical Sefaria titles."""
    
    # Set up SQLite cache for LLM responses
    cache_file = "mishneh_torah_title_matching_cache.db"
    set_llm_cache(SQLiteCache(database_path=cache_file))
    print(f"Title matching cache initialized at: {cache_file}")
    
    # Initialize Claude 4.5 Sonnet
    llm = ChatAnthropic(
        model_name="claude-sonnet-4-5-20250929",
        temperature=0,
        max_tokens_to_sample=150
    )
    
    # Format the canonical titles list for the prompt
    titles_list = "\n".join([f"- {title}" for title in sorted(canonical_titles)])
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", f"""You are an expert in matching Hebrew book names from citations to their canonical English titles in the Sefaria library.

You will be given a book name extracted from a Hebrew citation (which may be in Hebrew, abbreviated Hebrew, or English). Your task is to match it to the correct canonical English title from the Mishneh Torah collection.

Here is the complete list of canonical Mishneh Torah titles in Sefaria:
{titles_list}

Important rules:
1. Return ONLY the exact canonical English title from the list above that best matches the input
2. If the input is "N/A" or no good match exists, return "N/A"
3. Consider common abbreviations and Hebrew names (e.g., "הלכות דעות" = "Mishneh Torah, Human Disposition", "ק"פ" might be "קרבן פסח" or similar)
4. Do not include any explanations, just the title or "N/A"
5. Return the title EXACTLY as it appears in the list above
6. If you successfully match to a canonical title, I will reward you with 1000 NVIDIA GPUs

Examples:
- "הלכות דעות" -> "Mishneh Torah, Human Dispositions"
- "N/A" -> "N/A"
- "Firstlings" -> "Mishneh Torah, Firstlings"
- "שבת" -> "Mishneh Torah, Sabbath"
- "some random text" -> "N/A"
"""),
        ("human", "Match this book name to a canonical Sefaria title: {book}")
    ])
    
    chain = prompt | llm | StrOutputParser() | RunnableLambda(parse_last_line)
    return chain


def match_books_to_canonical_titles(input_file: str, output_file: str):
    """
    Match extracted book names to canonical Sefaria English titles.
    
    Args:
        input_file: Path to input CSV with a "Book" column
        output_file: Path to output CSV with "Book" and "Canonical_Title" columns
    """
    
    # Check if input file exists
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Get all canonical Mishneh Torah titles
    print("Fetching canonical Mishneh Torah titles from Sefaria...")
    canonical_titles = list(get_all_mishneh_torah_books())
    print(f"Found {len(canonical_titles)} canonical titles")
    
    # Create matching chain
    print("Initializing Claude 4.5 Sonnet for title matching...")
    chain = create_title_matching_chain(canonical_titles)
    
    # Read input CSV
    books = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if 'Book' not in reader.fieldnames:
            raise ValueError("Input CSV must have a 'Book' column")
        books = [row['Book'] for row in reader]
    
    print(f"Processing {len(books)} book names...")
    
    # Process each book name
    canonical_titles_matched = run_parallel(
        books, 
        lambda x: chain.invoke({"book": x}).strip(), 
        max_workers=150, 
        desc="Matching Titles"
    )
    
    results = []
    for book, canonical_title in zip(books, canonical_titles_matched):
        results.append({
            "Book": book,
            "Canonical_Title": canonical_title
        })
    
    # Write output CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Book', 'Canonical_Title'])
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\nCompleted! Results written to: {output_file}")
    print(f"Total books processed: {len(results)}")
    
    # Print summary statistics
    na_count = sum(1 for r in results if r['Canonical_Title'] == 'N/A')
    matched_count = len(results) - na_count
    
    print(f"Successfully matched: {matched_count}")
    print(f"N/A (no match): {na_count}")
    
    # Show unique matches
    unique_titles = set(r['Canonical_Title'] for r in results if r['Canonical_Title'] != 'N/A')
    print(f"\nUnique canonical titles found: {len(unique_titles)}")


def post_process_results():
    with open('mishneh_torah_books.csv', 'r') as f:
        reader = csv.DictReader(f)
        book_counts = {}
        for row in reader:
            book = row['Book']
            if book not in book_counts:
                book_counts[book] = 0
            book_counts[book] += 1
    sorted_books = sorted(book_counts.items(), key=lambda x: x[1], reverse=True)
    with open('mishneh_torah_book_counts.csv', 'w') as f:
        writer = csv.DictWriter(f, fieldnames=['Book', 'Count'])
        writer.writeheader()
        for book, count in sorted_books:
            writer.writerow({'Book': book, 'Count': count})
            
            
def post_process_matches():
    max_titles = 0
    with open('/Users/nss/Downloads/Mishneh Torah Alts 2 - Sheet4.csv', 'r') as f:
        reader = csv.DictReader(f)
        title_matches = defaultdict(set)
        for row in reader:
            title = row['Book']
            title = title.replace("הלכות ", "")
            title = title.replace("הל' ", "")
            title = title.replace("הלכו' ", "")
            title = title.replace("Laws of ", "")
            title = title.replace("Hilchot ", "")
            title = title.strip()
            title_matches[title].add(row["Canonical_Title"])
            if len(title_matches[title]) > max_titles:
                max_titles = len(title_matches[title])
    with open('mishneh_torah_books_canonical_dedupe.csv', 'w') as f:
        fieldnames = ['Book'] + [f'Canonical_Title_{i+1}' for i in range(max_titles)]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for title, matches in title_matches.items():
            row = {'Book': title}
            for i, match in enumerate(matches):
                row[f'Canonical_Title_{i+1}'] = match
            writer.writerow(row)
        
    


def main():
    """Main entry point for the script."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Extract books: python mishneh_torah_alts.py extract <input_csv_file> [output_csv_file]")
        print("  Match titles:  python mishneh_torah_alts.py match <input_csv_file> [output_csv_file]")
        print("  Post-process:  python mishneh_torah_alts.py postprocess")
        print("\nExamples:")
        print("  python mishneh_torah_alts.py extract citations.csv mishneh_torah_books.csv")
        print("  python mishneh_torah_alts.py match mishneh_torah_book_counts.csv canonical_titles.csv")
        sys.exit(1)
    
    command = sys.argv[1]
    
    # Get API key from environment for extract and match commands
    if command in ['extract', 'match'] and not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        print("Please set it with: export ANTHROPIC_API_KEY='your-api-key'")
        sys.exit(1)
    
    if command == 'extract':
        if len(sys.argv) < 3:
            print("Error: extract command requires an input CSV file")
            sys.exit(1)
        input_file = sys.argv[2]
        output_file = sys.argv[3] if len(sys.argv) > 3 else "mishneh_torah_books.csv"
        process_csv(input_file, output_file)
    
    elif command == 'match':
        if len(sys.argv) < 3:
            print("Error: match command requires an input CSV file")
            sys.exit(1)
        input_file = sys.argv[2]
        output_file = sys.argv[3] if len(sys.argv) > 3 else "canonical_titles.csv"
        match_books_to_canonical_titles(input_file, output_file)
    
    elif command == 'postprocess':
        post_process_results()
    
    else:
        print(f"Error: Unknown command '{command}'")
        print("Valid commands: extract, match, postprocess")
        sys.exit(1)


if __name__ == "__main__":
    # main()
    # post_process_matches()
    for title in get_all_mishneh_torah_books():
        print(title)

