from pymongo import MongoClient

# Replace the URI string with your MongoDB connection string
connection_string = "mongodb://localhost:27017/"  # For a local instance
# For MongoDB Atlas, your connection string might look like:
# connection_string = "mongodb+srv://<username>:<password>@cluster0.mongodb.net/test?retryWrites=true&w=majority"

# Create a MongoClient
client = MongoClient(connection_string)

# Access a database
db = client['sefaria']

# Access a collection
index_collection = db['index']


documents = index_collection.find()
texts = []

for doc in documents:
    texts.append({
        'title': doc['title'],
        'text_category': doc['categories'],
    })
    
update_result = db['text_permission_groups'].update_one(
    {"name": "default"},  # Query to find the document
    {"$push": {"texts": {"$each": texts}}}  # Use $push with $each to add multiple items
)

# Print the result
if update_result.modified_count > 0:
    print("Texts added successfully.")
else:
    print("No matching document found or no update performed.")