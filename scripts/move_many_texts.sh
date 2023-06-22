#!/bin/bash

links=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    -k)
      shift
      apikey="$1"
      shift
      ;;
    -d)
      shift
      dest="$1"
      shift
      ;;
    -l)
      shift
      links="$1"
      shift
      ;;
    *)
      books+=("$1")
      shift
      ;;
  esac
done

if [[ "${dest}" == "prod" ]]; then
  dest="https://www.sefaria.org"
fi

echo -e "-v all -l $links -d $dest -k $apikey \n\n"

for book in "${books[@]}"; do
  echo -e "====== $book =======\n\n"
  output=$(python move_draft_text.py "$book" -k "$apikey" -d "$dest" -l "$links" -v all)

  shopt -s nocasematch
  while IFS= read -r line; do
    if [[ $line == *"error"* ]]; then
      echo -e "\e[31m$line\e[0m"
    else
      echo "$line"
    fi
  shopt -u nocasematch

  done <<< "$output"
done
