from .local_settings import GOOGLE_APPLICATION_CREDENTIALS_FILEPATH
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
    def upload_file(cls, from_file, to_filename, bucket_name, old_filename=None):
        """
        Used to upload a file to google cloud
        :param from_file: either full path to file to upload or file-like object
        :param to_filename: filename to save in cloud. should not include folders
        :param bucket_name: name of the bucket to save the file
        """
        bucket = cls.get_bucket(bucket_name)
        if old_filename is not None:
            cls.delete_filename(bucket_name, old_filename)
        blob = bucket.blob(to_filename)
        if isinstance(from_file, basestring):
            blob.upload_from_filename(from_file)
        else:
            # assume file-like object
            blob.upload_from_file(from_file)
        return cls.get_url(to_filename, bucket_name)

    @classmethod
    def delete_filename(cls, bucket_name, filename):
        bucket = cls.get_bucket(bucket_name)
        blob = bucket.blob(filename)
        if blob.exists():
            blob.delete()

    @classmethod
    def get_url(cls, filename, bucket_name):
        return u"{}/{}/{}".format(cls.BASE_URL, bucket_name, filename)
