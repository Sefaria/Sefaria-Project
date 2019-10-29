from settings import GOOGLE_APPLICATION_CREDENTIALS_FILEPATH
from google.cloud import storage

class GoogleStorageManager(object):

    PROFILES_BUCKET = u'sefaria-profile-pictures'
    BASE_URL = u"https://storage.googleapis.com"

    @classmethod
    def get_bucket(cls, bucket_name):
        if getattr(cls, 'client', None) is None:
            cls.client = storage.Client.from_service_account_json(GOOGLE_APPLICATION_CREDENTIALS_FILEPATH)
        bucket = cls.client.get_bucket(bucket_name)
        return bucket

    @classmethod
    def upload_filename(cls, from_filename, to_filename, bucket_name):
        """
        Used to upload a file stored on disk
        :param from_filename: full path to file to upload
        :param to_filename: filename to save in cloud. should not include folders
        :param bucket_name: name of the bucket to save the file
        """
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(to_filename)
        blob.upload_from_filename(from_filename)
        return cls.get_url(to_filename, bucket_name)

    @classmethod
    def upload_file(cls, from_file, to_filename, bucket_name):
        """
        Used to upload file-like objects
        :param from_file: file-like object to upload
        :param to_filename: filename to save in cloud. should not include folders
        :param bucket_name: name of the bucket to save the file
        """
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(to_filename)
        blob.upload_from_file(from_file)
        return cls.get_url(to_filename, bucket_name)

    @classmethod
    def get_url(cls, filename, bucket_name):
        return u"{}/{}/{}".format(cls.BASE_URL, bucket_name, filename)
