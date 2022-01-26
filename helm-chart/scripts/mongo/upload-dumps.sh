#!/usr/bin/env bash
gcloud auth activate-service-account --key-file ${GOOGLE_APPLICATION_CREDENTIALS}
cd "/mongodumps/shared_volume"
today="$(date +'%d.%m.%y')"
last_week="$(date --date='last week' +'%d.%m.%y')"

gsutil rm "gs://sefaria-mongo-backup/private_dump_${last_week}.tar.gz"
gsutil rm "gs://sefaria-mongo-backup/private_dump_small_${last_week}.tar.gz"

if [ -f "private_dump.tar.gz" ]; then
  echo "uploading private dump"
  gsutil cp private_dump.tar.gz "gs://sefaria-mongo-backup/private_dump_${today}.tar.gz"

  if [ "$(date +'%d')" == "01" ]; then  #  Upload to Nearline storage on the first of every month
    echo "Archiving to Nearline Storage"
    gsutil cp private_dump.tar.gz "gs://sefaria-mongo-archive/private_dump_${today}.tar.gz"
  fi
else
  echo "Private dump missing"

fi

if [ -f "private_dump_small.tar.gz" ]; then
  echo "uploading private small dump"
  gsutil cp private_dump_small.tar.gz "gs://sefaria-mongo-backup/private_dump_small_${today}.tar.gz"
else
  echo "small private dump missing"
fi

if [ -f "dump_small.tar.gz" ]; then
  echo "uploading small public dump"
  gsutil cp dump_small.tar.gz gs://sefaria-mongo-backup
  gsutil acl ch -u AllUsers:R gs://sefaria-mongo-backup/dump_small.tar.gz
else
  echo "small public dump missing"
fi

if [ -f "dump.tar.gz" ]; then
  echo "Uploading Public Dump"
  gsutil cp dump.tar.gz gs://sefaria-mongo-backup
  gsutil acl ch -u AllUsers:R gs://sefaria-mongo-backup/dump.tar.gz
else
  echo "public dump missing"
fi
curl -X POST --data-urlencode 'payload={"channel": "#engineering", "username": "Data Archiver", "text": "The MongoDB store was routinely dumped to cloud storage: '"$(date)"'", "icon_emoji": ":cloud:"}' ${SLACK_URL}