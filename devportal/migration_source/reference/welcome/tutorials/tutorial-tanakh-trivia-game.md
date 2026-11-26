---
title: 'Tutorial: Tanakh Trivia Game'
excerpt: >-
  This tutorial demonstrates a proof-of-concept for a Tanakh trivia game powered
  by the Sefaria API, in approximately 100 lines of code.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: endpoint
      slug: text
      title: Text
---
# Tanakh Trivia

This tutorial will explain how to build a mini Tanakh Trivia Game in fewer than 100 lines of code. As you build, you'll hit multiple endpoints in the Sefaria API, weaving them all together to create an educational activity in the console.

## The Basics: Project Outline

Before we start coding, let's go over the game structure and which endpoints each trivia question requires.

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        #
      </th>

      <th>
        Question
      </th>

      <th>
        Endpoint(s)
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        1
      </td>

      <td>
        How many chapters does `<Book of Tanakh>` have?
      </td>

      <td>
        [Shape](ref:get-shape) API
      </td>
    </tr>

    <tr>
      <td>
        2
      </td>

      <td>
        Which chapter of that `<Book of Tanakh>` has the fewest verses?
      </td>

      <td>
        [Shape](ref:get-shape)  API
      </td>
    </tr>

    <tr>
      <td>
        3
      </td>

      <td>
        Select a verse from `<Book of Tanakh>`. Which topics might be connected to this text?
      </td>

      <td>
        [Texts (v3)](ref:get-v3-texts) API<br />_and_<br />[Ref-Topic-Links](ref:get-ref-topic-links) API
      </td>
    </tr>
  </tbody>
</Table>

In order to provide a working sample, this tutorial will limit the user's selection of Books of Tanakh to three specific books. This is not a necessary limitation. When building this project, you can select any book or books they wish to focus on.

:warning: _Please note: This tutorial is a proof-of-concept. Therefore, we will take some shortcuts and stick to this limited question set in order to showcase the ways in which you might use our API for a project like this. Please feel free to iterate on this basic outline!_

## 1. Getting Set Up

This tutorial will use Python 3.8.

Before beginning, ensure you have [Python requests](https://pypi.org/project/requests/) installed and imported at the top of your file:

```python
import requests
```

The work we're doing in this tutorial is language agnostic, so feel free to adapt the code in order to to include the languages you want to include.

## 2. Selecting a Book

Prompt the user to select a Book of Tanakh. This book will be the focus for all of the trivia questions going forward.

```python
print("Welcome to the Tanakh Trivia Game!")

# Setting up the 'score' variable
score = 0

# Limited choices for the user
index_dict = {"A": "Exodus", "B": "Joshua", "C": "Esther"}

# Printing the menu
for key in index_dict:
  print(f"Option {key}: {index_dict[key]}")
  s = input("Select a text from the list by pressing the corresponding letter key ['A', 'B', 'C']: ").upper()

```

The user will see something like this in their console:

```
Welcome to the Tanakh Trivia Game!
Option A: Exodus
Option B: Joshua
Option C: Esther
Select a text from the list by pressing the corresponding letter key ['A', 'B', 'C']:
```

Next, process the user input like this:

```python
# If they selected a valid key, set the book for the game
if s in index_dict.keys():
  print(f"You picked {index_dict[s]}")
  index_title = index_dict[s]
  
else:
  print("Sorry! That's not a valid option. Restart the game and try again.")
```

## 3. Bringing in the Shape API

The first two questions we'll ask rely heavily on the [Shape](ref:get-shape) API, which returns data about the structure of a book in the Sefaria Library. For example, if someone were to query the [Shape](ref:get-shape) API for the book of `Esther`, they'd get the following JSON in return:

```json
{
	"section": "Writings",
	"heTitle": "אסתר",
	"title": "Esther",
	"length": 10,
	"chapters": [
		22,
		23,
		15,
		17,
		14,
		14,
		10,
		17,
		32,
		3
	],
	"book": "Esther",
	"heBook": "אסתר"
}
```

The most interesting data here appears in the `length` and the `chapters` fields. The `length` field tells you the how many chapters are in the text at hand. In this case, the book of Esther has 10 chapters). The `chapters` field contains integers that indicate the number of verses in a specific chapter.

All books of Tanakh have `length` number of integers. Taking the book of Esther as an example, we can see a `chapters` array with 10 integers. Each position in the array corresponds with a chapter, with each value corresponding to the number of verses in that chapter. The first integer in the array indicates that there are 22 verses in the first chapter of the book of Esther, the fifth indicates that there are 14 verses in chapter five, and so forth.

Next, we will use the [Shape](ref:get_api-shape-title) API to ask some questions about the structure of a book.

## 4. Let the Trivia Begin!

First, we query the [Shape](ref:get_api-shape-title) API:

```python
url = f"https://www.sefaria.org/api/shape/{index_title}"
response = requests.get(url)
shape = response.json()
```

Next, we want to see if the trivia player can guess the number of chapters in the chosen book. In order to build that part of the trivia game, we'll grab that data and save it as our `answer`.

```python
answer = shape[0]["length"]
```

Now we can ask the user with a question about the number of chapters in the book. Since we want all responses to this question to be integers, we'll cast their input as an `int()`. We do this inside a `try`/`except` block.

```python
q1 = input(f"How many chapters are in {index_title}? ")

try:
  q1 = int(q1)
except Exception as e:
  print("Sorry, that's not a number. Please restart the game and try again")
```

Assuming we received a numeric response, let's check it against our data in `answer` from the [Shape](ref:get_api-shape-title) API to see whether or not they guessed correctly:

```python
if answer == q1:
  print("Yes! You got it right!")
  score += 1
else:
  print(f"Sorry! That's incorrect. The correct answer was: {answer}. You answered {score}/3 question(s)")
```

While playing, the user will see something like this:

```
You picked Esther
Here are some trivia questions about that text:
How many chapters are in Esther? 
>>> 10
Yes! You got it right!
```

## 5. Adding Another Question

Let's ask the user another question using more data from the [Shape](ref:get_api-shape-title) API. Again, our API response is stored inside a variable called `shape`.

Start by calculating the shortest chapter of the book. In order to do this, we will use the Python `min()` function on the chapters array to find the position with the fewest verses. Then (since our array is 0-based) we'll add `1` to calculate a human-readable chapter.

```python
q2 = input(f"Which chapter of {index_title} is the shortest? ")

shortest = min(shape[0]["chapters"]) + 1
```

Now that we've prompted the user and calculated the answer, we'll follow a similar `try`/`except` pattern like before to check if the user's answer is correct, and inform them accordingly:

```python
try:
  q2 = int(q2)
except Exception as e:
  print("Sorry, that's not a number. Please restart the game and try again")

if shortest == q2:
  print("Yes! You got it right!")
  score += 1
else:
  print(f"Sorry! That's incorrect. The correct answer was: {shortest}. You answered {score}/3 question(s)")

```

The user might see something like this:

```
Which chapter of Joshua is the shortest? 
>>> 23
Sorry! That's incorrect. The correct answer was: 24. You answered 1/3 question(s)
```

## 6. One Last Round

For the final question, we will use the [Ref-Topic-Links](ref:get-ref-topic-links) API in order to ask the user which topics might be related to a given verse.

First, we need to prompt the user to provide us with a specific reference to a verse.

_Note: if this were a real game, and not just a tutorial, we would add some data validation at this point. For the purposes of this tutorial, we are keeping it simple._

```python
chapVerse = input(
        f"Please enter the Chapter and verse you'd like to select from {index_title},separated by a colon [ex: '12:1', '1:4']. (:) ")

ref = f"{index_title} {chapVerse}"
```

Next, we'll query the [Texts (v3)](ref:get-v3-texts) API to retrieve the text of the given verse in English (or another language) to display for the user in order to make it easier for them to guess the answer.

```python
url = f"https://www.sefaria.org/api/v3/texts/{ref}?version=english"
response = requests.get(url)
texts = response.json()

print(f"Here's the text of the verse you selected:{texts['versions'][0]['text']}")
```

With the verse in view, and we can ask the user to guess some topics that may be related to the text.

First, we query for the related topics:

```python
url = f"https://www.sefaria.org/api/ref-topic-links/{ref}"
response = requests.get(url)
topics = response.json()
```

Then, we generate a set of the topics we get back, since we don't need all of the other metadata. This ensures every entry is unique. We'll also strip out the hyphens between words of multi-word topics so it's easier to guess (i.e. `mount-sinai` will become `mount sinai`).

```python
topicList = [topic["topic"].replace("-", " ") for topic in topics]
topic_set = set(topicList)
```

We have all of the data. Now we will ask our user to guess:

```python
q3 = input("Can you guess a topic related to this text?").lower()

if q3 in topic_set:
  score += 1
  print(f"Yes! You got it right! That topic is connected to this verse! FINAL SCORE: {score}/3")

else:
  print(f"Sorry! That's incorrect. The topics related to this verse are: {topic_set}. FINAL SCORE: {score}/3")
  return
```

The user might see something like this:

```
OK let's get a little more specific now!
Please enter the Chapter and verse you'd like to select from Exodus, separated by a colon [ex: '12:1', '1:4']. (:) 
>>> 19:4

Here's the text of the verse you selected:
 ‘You have seen what I did to the Egyptians, how I bore you on eagles’ wings and brought you to Me.
 
Can you guess a topic related to this text?
 >>> Mount Sinai
Yes! You got it right! That topic is connected to this verse! FINAL SCORE: 3/3
```

<Callout icon="🎉" theme="default">
  ## Congratulations! You've written a basic Tanakh trivia game using the data from the Sefaria API.
</Callout>

We invite you to dive deeper into our API and to explore the infinite possibilities available to developers using our data and documentation. We can't wait to Lookingsee what you build!

# Summary: The Full Code

Below is the full working code for this game.

_Please note: We've generalized some repeating code into rudimentary functions and added some first steps of data validation or checking in order to avoid unnecessary erroring._

```python
import requests


# Generalized function for the specific API calls in this tutorial
def sefaria_get(endpoint, index_or_ref=None, params=None):
    url = f"https://www.sefaria.org/api/{endpoint}/{index_or_ref}"
    if params:
        url = f"{url}?{params}"
    response = requests.get(url)
    if response.status_code != 200:
        print("Invalid citation. Please restart the game and try again")
        return None
    return response.json()


# Main game function
def game():
    print("Welcome to the Tanakh trivia game!!")

    score = 0
    index_dict = {"A": "Exodus", "B": "Joshua", "C": "Esther"}
    
		# Display index options
    for key in index_dict:
        print(f"Option {key}: {index_dict[key]}")
        
    # Collect user input, and capitalize
    s = input("Select a text from the list by pressing the corresponding letter key ['A', 'B', 'C']: ").upper()

    # Respond to user input
    if s in index_dict.keys():
        print(f"You picked {index_dict[s]}")
        index_title = index_dict[s]
    else:
        print("Sorry! That's not a valid option. Restart the game and try again.")
        return

    # Query the Shape API
    shape = sefaria_get("shape", index_or_ref=index_title)
    if not shape:
        return None
    
    # Save answer for question 1
    answer = shape[0]["length"]

    print("Here are some trivia questions about that text:")
    
    # Question 1
    q1 = input(f"How many chapters are in {index_title}? ")

    # Check if response is an int
    try:
        q1 = int(q1)
    except Exception as e:
        print("Sorry, that's not a number. Please restart the game and try again")
        return

    # Check answer
    if answer == q1:
        print("Yes! You got it right!")
        score += 1
    else:
        print(f"Sorry! That's incorrect. The correct answer was: {answer}. You answered {score}/3 question(s)")
        return

    # Question 2
    q2 = input(f"Which chapter of {index_title} is the shortest? ")

    # Calculate which chapter of the text is the shortest (fewest verses)
    shortest = min(shape[0]["chapters"]) + 1

    # Check if input is an int
    try:
        q2 = int(q2)
    except Exception as e:
        print("Sorry, that's not a number. Please restart the game and try again")
        return

    # Check if answer is correct
    if shortest == q2:
        print("Yes! You got it right!")
        score += 1
    else:
        print(f"Sorry! That's incorrect. The correct answer was: {shortest}. You answered {score}/3 question(s)")
        return

    print("OK let's get a little more specific now!")

    # Prompt user for specific verse reference
    chapVerse = input(
        f"Please enter the chapter and verse you'd like to select from {index_title}, separated by a colon [ex: '12:1', '1:4']. (:) ")

    # Create a text reference
    ref = f"{index_title} {chapVerse}"
    
    # Query the v3 texts API
    texts = sefaria_get("v3/texts", index_or_ref=ref, params="version=english")
    if not texts:
        return None
    print(f"Here's the text of the verse you selected:\n {texts['versions'][0]['text']}")

    # Question 3
    q3 = input("Can you guess a topic related to this text?").lower()

    # Query the ref-topic-links endpoint
    topics = sefaria_get("ref-topic-links", index_or_ref=ref)
    if not topics:
        return None
      
		# Create a set of topics, removing the hyphens and replacing with spaces to make
    # it more intuitive for users guessing
    topicList = [topic["topic"].replace("-", " ") for topic in topics]
    topic_set = set(topicList)

    # Check if user answered correctly
    if q3 in topic_set:
        score += 1
        print(f"Yes! You got it right! That topic is connected to this verse! FINAL SCORE: {score}/3")

    else:
        print(f"Sorry! That's incorrect. The topics related to this verse are: {topic_set}.FINAL SCORE: {score}/3")
        return


if __name__ == '__main__':
    game()

    
```

## Please Note:

- As stated above, this tutorial is just that: a tutorial, with the intention of showcasing a few different ways of using Sefaria's data and API.
- Any attempt to flesh this out and get it ready for use in a real-world settings would require more data validation, checks, `try` / `except` blocks and more.
- Up for the challenge? Feel free to give it a try and build off of this — and drop us a note to [let us know](https://developers.sefaria.org/page/contact-us)!

<br />
