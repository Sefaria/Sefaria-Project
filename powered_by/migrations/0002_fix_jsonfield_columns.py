from django.db import migrations


class Migration(migrations.Migration):
    """
    0001_initial was edited in-place from ArrayField to JSONField after it had
    already been applied on some databases, leaving those columns as
    character varying[] instead of jsonb. This migration corrects them.
    The DO block is a no-op on databases where the columns are already jsonb.
    """

    dependencies = [
        ("powered_by", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'powered_by_project'
                          AND column_name = 'sefaria_tools_used'
                          AND data_type != 'jsonb'
                    ) THEN
                        ALTER TABLE powered_by_project
                            ALTER COLUMN sefaria_tools_used TYPE jsonb
                            USING to_jsonb(sefaria_tools_used);
                        ALTER TABLE powered_by_project
                            ALTER COLUMN tags TYPE jsonb
                            USING to_jsonb(tags);
                    END IF;
                END $$;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
