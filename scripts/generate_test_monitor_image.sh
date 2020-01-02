#!/usr/bin/env bash
cd "${0%/*}"  # cd to directory of script
TMP_DIR="./tmp_monitor_build"

[ -d $TMP_DIR ] && rm -rf $TMP_DIR
mkdir $TMP_DIR
cd $TMP_DIR
cp ../../build/monitor/Dockerfile ./Dockerfile-old

BRANCH=""
IMAGE="monitor_test_image"
while getopts "b:i:" opt; do
  case $opt in
    b) BRANCH="$OPTARG"
    ;;
    i) IMAGE="$OPTARG"
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
    ;;
  esac
done

SEFARIA_GITHUB="https://github.com/Sefaria/Sefaria-Project.git"
if [ -z $BRANCH ]; then
    CLONE_CMD=$SEFARIA_GITHUB
else
    CLONE_CMD="-b $BRANCH $SEFARIA_GITHUB"
fi

# dont copy sefaria-project. instead clone it. less bandwidth to upload to gcloud
sed -e "s,COPY . /app/,RUN git clone $CLONE_CMD /app," Dockerfile-old > Dockerfile
rm Dockerfile-old

gcloud container builds submit --tag "gcr.io/production-deployment/$IMAGE" .

cd ..
rm -rf $TMP_DIR
