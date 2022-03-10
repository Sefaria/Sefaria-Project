from .settings import GOOGLE_APPLICATION_CREDENTIALS_FILEPATH
from google.cloud import storage
import re

class GoogleStorageManager(object):

    """
    Wrapper class for interacting with Google Cloud storage via Google's API classes.
    Please note that several Google exceptions (mostly subclasses of google.cloud.exceptions.GoogleAPICallError)
    or Python Exceptions if used incorrectly may be raised and that calling functions should handle them.
    https://googleapis.dev/python/google-api-core/latest/exceptions.html#google.api_core.exceptions.GoogleAPIError
    https://googleapis.dev/python/storage/latest/client.html
    https://googleapis.dev/python/storage/latest/buckets.html
    """

    PROFILES_BUCKET = 'sefaria-profile-pictures'
    UGC_SHEET_BUCKET = 'sheet-user-uploaded-media'

    BASE_URL = "https://storage.googleapis.com"

    @classmethod
    def get_bucket(cls, bucket_name):
        if getattr(cls, 'client', None) is None:
            cls.client = storage.Client.from_service_account_json(GOOGLE_APPLICATION_CREDENTIALS_FILEPATH)
        bucket = cls.client.get_bucket(bucket_name)
        return bucket

    @classmethod
    def upload_file(cls, from_file, to_filename, bucket_name, old_filename=None):
        """
        Used to upload a file to google cloud
        :param from_file: either full path to file to upload or file-like object
        :param to_filename: filename to save in cloud. should not include folders
        :param bucket_name: name of the bucket to save the file
        """
        bucket = cls.get_bucket(bucket_name)
        if old_filename is not None:
            cls.delete_filename(old_filename, bucket_name)
        blob = bucket.blob(to_filename)
        if isinstance(from_file, str):
            blob.upload_from_filename(from_file)
        else:
            # assume file-like object
            blob.upload_from_file(from_file)
        return cls.get_url(to_filename, bucket_name)

    @classmethod
    def duplicate_file(cls, from_file, to_filename, bucket_name):
        bucket = cls.get_bucket(bucket_name)
        source_blob = bucket.blob(from_file)
        blob_copy = bucket.copy_blob(source_blob, bucket, to_filename)
        return cls.get_url(to_filename, bucket_name)


    @classmethod
    def delete_filename(cls, filename, bucket_name):
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(filename)
        if blob.exists():
            blob.delete()

    @classmethod
    def file_exists(cls, filename, bucket_name):
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(filename)
        return blob.exists()

    @classmethod
    def get_url(cls, filename, bucket_name):
        return "{}/{}/{}".format(cls.BASE_URL, bucket_name, filename)

    @classmethod
    def get_filename(cls, old_file_url):
        return re.findall(r"/([^/]+)$", old_file_url)[0] if old_file_url.startswith(cls.BASE_URL) else None