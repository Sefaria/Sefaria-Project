from sefaria.helper.llm.tasks.commentary_scoring import \
    generate_and_save_commentary_scoring
from sefaria.model import library
from sefaria.system.database import db
from sefaria.client.wrapper import get_links
from commentary_scoring_tools import parse_link_for_base

library.build_text_titles_json()


def get_quoting_links(tref):
    """Get all quoting commentary links for a given text reference."""
    links = get_links(tref, False)
    return [l for l in links if l["category"] == "Quoting Commentary"]


def grade_single_link(link_id: str, force_update: bool = False):
    """
    Grade a single link by its ObjectId.
    """
    from bson import ObjectId

    try:
        # Find the link document by ID
        link_doc = db.links.find_one({"_id": ObjectId(link_id)})
        if not link_doc:
            print(f"No link found with ID: {link_id}")
            return

        comm_ref, base_ref = parse_link_for_base(link_doc)
        print(f"Processing link {link_id}: {comm_ref} -> {base_ref}")
        # Check if already graded
        rel = link_doc.get("relevance_score", None)
        if rel is not None and not force_update:
            print(f"Link {link_id} already has relevance score: {rel}")
            return

        # Generate and save scoring
        generate_and_save_commentary_scoring(comm_ref)
        print(f"Successfully processed link {link_id}")

    except Exception as e:
        print(f"Error processing link {link_id}: {str(e)}")


def grade_sefaria_commentary_links_optimized(
        base_ref_str: str = "Genesis 1:3", force_update: bool = False):
    """
    Walk links for base ref, and ONLY trigger grading for commentary refs
    whose graded span (anchor) is NOT yet present in the log.
    """
    i = 0
    quoting_commentaries = get_quoting_links(base_ref_str)
    print(f"Found {len(quoting_commentaries)} quoting commentaries for "
          f"{base_ref_str}")

    for link in quoting_commentaries:
        comm_key = link['ref']
        anchor_key = link['anchorRef']

        link_doc = db.links.find_one(
            {"refs": {"$all": [comm_key, anchor_key]}}
        )

        if not link_doc:
            print(f"Warning: Could not find link document for "
                  f"{comm_key} -> {anchor_key}")
            continue

        rel = link_doc.get("relevance_score", None)
        if rel is not None and not force_update:
            print(
                f"Link for {comm_key} already has relevance score: {rel} "
                f"(use force_update=True to override)"
                )
            return
        elif rel is not None and force_update:
            print(
                f"Link for {comm_key} already scored ({rel}), "
                f"but force_update=True - updating anyway"
                )

            # Generate and save scoring
        generate_and_save_commentary_scoring(comm_key)
        print(f"Link for {comm_key} is sent for scoring ")
    print(f"Number of newly processed quoting commentaries: {i}")


if __name__ == "__main__":
    # OPTION 1: Grade a single link by ObjectId
    # Uncomment the line below and replace with actual link ID
    grade_single_link("4fde272eedbab43f7f000022", force_update=True)

    # OPTION 2: Grade all commentary links for a specific reference
    # Uncomment the line below and modify the reference as needed
    # grade_sefaria_commentary_links_optimized("Exodus 6:14", force_update=True)

    # OPTION 3: Grade multiple specific references
    # Uncomment and modify as needed
    # refs_to_process = ["Genesis 1:1", "Exodus 1:1", "Leviticus 1:1"]
    # for ref in refs_to_process:
    #     print(f"\n=== Processing {ref} ===")
    #     grade_sefaria_commentary_links_optimized(ref)