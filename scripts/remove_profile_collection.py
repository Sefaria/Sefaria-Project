from sefaria.system.database import db

def update_empty(copy_into, copy_from):
    for k, v in list(copy_from.items()):
        if v:
            if k not in copy_into or copy_into[k] == '' or copy_into[k] == []:
                copy_into[k] = v
    db.profiles.update_one({"id": copy_into["id"]}, {"$set": copy_into})


if __name__ == '__main__':
    profiles_copy_from = db.profile.find()
    for profile_copy_from in profiles_copy_from:
        copy_into = db.profile.find_one({"id": profile_copy_from["id"]})
        update_empty(copy_into, profile_copy_from)
        db.profile.delete_one({"id": profile_copy_from["id"]})

