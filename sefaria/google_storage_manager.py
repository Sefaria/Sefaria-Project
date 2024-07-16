from google.cloud import storage
import re
from io import BytesIO
from sefaria.site.site_settings import SITE_SETTINGS
from .settings import GOOGLE_APPLICATION_CREDENTIALS
from google.oauth2 import service_account

class GoogleStorageManager(object):

    """
    Wrapper class for interacting with Google Cloud storage via Google's API classes.
    Please note that several Google exceptions (mostly subclasses of google.cloud.exceptions.GoogleAPICallError)
    or Python Exceptions if used incorrectly may be raised and that calling functions should handle them.
    https://googleapis.dev/python/google-api-core/latest/exceptions.html#google.api_core.exceptions.GoogleAPIError
    https://googleapis.dev/python/storage/latest/client.html
    https://googleapis.dev/python/storage/latest/buckets.html
    """

    COLLECTIONS_BUCKET = SITE_SETTINGS["COLLECTIONS_BUCKET"]
    PROFILES_BUCKET = SITE_SETTINGS["PROFILES_BUCKET"]
    UGC_SHEET_BUCKET = SITE_SETTINGS["UGC_BUCKET"]
    TOPICS_BUCKET = SITE_SETTINGS["TOPICS_BUCKET"]

    BASE_URL = "https://storage.googleapis.com"

    @classmethod
    def get_bucket(cls, bucket_name):
        if getattr(cls, 'client', None) is None:
            # for local development, change below line to cls.client = storage.Client(project="production-deployment")
            # cls.client = storage.Client.from_service_account_json(GOOGLE_APPLICATION_CREDENTIALS_FILEPATH)
            # cls.client = storage.Client(credentials=GOOGLE_APPLICATION_CREDENTIALS)
            credentials = service_account.Credentials.from_service_account_info(GOOGLE_APPLICATION_CREDENTIALS)
            cls.client = storage.Client(credentials=credentials, project=GOOGLE_APPLICATION_CREDENTIALS["project_id"])
        # Initialize the client with the credentials
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
    def get_filename(cls, filename, bucket_name):
        """
        Downloads `filename` and returns a file-like object with the data
        @param filename: name of file in `bucket_name`
        @param bucket_name: name of bucket
        @return: file-like object with the data
        """
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(filename)
        in_memory_file = BytesIO()
        blob.download_to_file(in_memory_file)
        in_memory_file.seek(0)
        return in_memory_file

    @classmethod
    def get_url(cls, filename, bucket_name):
        return "{}/{}/{}".format(cls.BASE_URL, bucket_name, filename)

    @classmethod
    def get_filename_from_url(cls, old_file_url):
        return re.findall(r"/([^/]+)$", old_file_url)[0] if old_file_url.startswith(cls.BASE_URL) else None