# file: myapp/fields.py

from django.db.models.fields.files import ImageField, ImageFieldFile

from sefaria.google_storage_manager import GoogleStorageManager

class GCSImageFieldFile(ImageFieldFile):
    """
    Minimal subclass of ImageFieldFile that stores files on Google Cloud Storage (GCS).
    We override `save()` and `delete()` to call GoogleStorageManager.
    """

    @property
    def url(self):
        """
        Return the GCS URL we stored in `self.name`.
        Django normally constructs the URL from default storage, but here
        we already have the public URL in `self.name`.
        """
        return self.name

    def save(self, name, content, save=True):
        """
        1) Upload file to GCS via GoogleStorageManager.
        2) Store the returned public URL in `self.name`.
        3) Optionally save the model field.
        """
        public_url = GoogleStorageManager.upload_file(
            from_file=content.file,     # file-like object
            to_filename=name,           # use incoming name for simplicity
            bucket_name=self.field.bucket_name
        )
        self.name = public_url
        self._committed = True

        if save:
            setattr(self.instance, self.field.name, self)
            self.instance.save(update_fields=[self.field.name])

    def delete(self, save=True):
        """
        Remove file from GCS (if exists), clear self.name, optionally save.
        """
        if self.name:
            # Extract the actual filename from the URL, then delete from GCS
            filename = GoogleStorageManager.get_filename_from_url(self.name)
            if filename:
                GoogleStorageManager.delete_filename(
                    filename=filename,
                    bucket_name=self.field.bucket_name
                )
        self.name = None
        self._committed = False

        if save:
            setattr(self.instance, self.field.name, self)
            self.instance.save(update_fields=[self.field.name])


class GCSImageField(ImageField):
    """
    Minimal custom ImageField that uses GCSImageFieldFile for storage.
    Stores the public GCS URL in the database instead of a local path.
    """
    attr_class = GCSImageFieldFile

    def __init__(self, bucket_name=None, *args, **kwargs):
        self.bucket_name = bucket_name or GoogleStorageManager.PROFILES_BUCKET
        super().__init__(*args, **kwargs)
