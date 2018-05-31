import boto3
import uuid
import os
import datetime
from tempfile import NamedTemporaryFile


from sefaria.settings import AWS_ACCESS_KEY, AWS_SECRET_KEY, S3_BUCKET
from sefaria.system.database import db

session = boto3.Session(
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
)
s3 = session.resource('s3')
bucket = s3.Bucket(S3_BUCKET)


class HostedFile(object):

	def __init__(self, filepath=None, content_type=None, url=None):
		self.filepath = filepath
		self.content_type = content_type
		self.url = url

	def upload(self):
		"""
		Uploads self.filepath to S3.
		"""
		if not self.filepath:
			raise Exception("No filepath set to upload.")
		path, extension = os.path.splitext(self.filepath)
		filename = "%s%s" % (str(uuid.uuid4()), extension)
		bucket.upload_file(self.filepath, filename, ExtraArgs={'ACL': 'public-read', 'ContentType': self.content_type})
		self.url = "https://s3.amazonaws.com/%s/%s" % (S3_BUCKET, filename)
		self.add_to_orphaned_list()
		return self.url

	def delete(self):
		"""
		Deletes self.url from S3.
		"""
		if not self.url:
			raise Exception("No URL set to delete.")
		filename = self.url.split("/")[-1]
		bucket.delete_objects(Delete={'Objects':[{'Key':filename}]})
		self.remove_from_orphaned_list()

	def add_to_orphaned_list(self):
		"""
		An orphaned file has no reference in the database.
		Since file URLS are created by uploading, every file begins life as an orphan. 
		Other objects which save references to hosted files must remove the file from the orphan list
		when they save their references. 
		"""
		if not self.url:
			raise Exception("No URL set.")
		db.orphaned_files.save({
			"url": self.url,
			"date": datetime.datetime.now()
		})

	def remove_from_orphaned_list(self):
		if not self.url:
			raise Exception("No URL set.")
		db.orphaned_files.remove({"url": self.url})


def delete_orphaned_files(minutes=5):
	"""
	Deletes any hosted file that has been on the orphan list for more than `minutes`. 
	"""
	cutoff = datetime.datetime.now() - datetime.timedelta(minutes=minutes)
	files = db.orphaned_files.find({"date": {"$lt": cutoff}})
	for file in files:
		HostedFile(url=file["url"]).delete()