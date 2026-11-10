from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("fixtureapp", "0001_alter_fx_item")]
    operations = [migrations.RunSQL("ALTER TABLE fx_item ADD COLUMN note2 text", migrations.RunSQL.noop)]
