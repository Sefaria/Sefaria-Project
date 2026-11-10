from django.db import migrations


class Migration(migrations.Migration):
    dependencies = []
    operations = [migrations.RunSQL("ALTER TABLE fx_item ADD COLUMN note text", migrations.RunSQL.noop)]
