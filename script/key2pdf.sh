#!/usr/bin/env bash

#/Usage:  key2pdf.sh cmd <url> <flags>
#/        key2pdf start
#/        key2pdf stop
#/        key2pdf register-pat <label> <pat> (NOT IMPLEMENTED)
#/        key2pdf convert-file <url> [--commit-after-convert] [--copy-to-gdrive]
#/        key2pdf convert-repo <url> [--commit-after-convert] [--copy-to-gdrive]
#/
#/  Convert a single keynote file to PDF, or all keynote files in a repository
#/  to PDF.  Optionally commit the converted PDFs back to GitHub and/or copy
#/  them to a configured location in Google Drive
#/
#/ COMMANDS:
#/
#/  start	Start the key2pdf server
#/
#/  stop	Stop the key2pdf server
#/
#/  convert-file            Convert a single file
#/
#/  convert-repo            Convert all files in a repository
#/
#/  register-pat            Store a PAT on the key2pdf server with a human
#/                          readable label (NOT IMPLEMENTED)
#/
#/
#/ OPTIONS:
#/
#/  url                     URL to a single Keynote file to be converted, or
#/                          to a branch in a repository to be converted.
#/
#/  label                   Human readable label to identify a PAT
#/
#/  pat                     Properly scoped GitHub Personal Access Token (PAT)
#/
#/ FLAGS:
#/
#/  commit-after-convert    If present, converted PDF files will be committed to
#/                          the source repo in the same location and on the
#/                          same branch as the source Keynote
#/
#/  copy-to-gdrive          If present, converted PDF files will be uploaded to
#/                          Google Drive
#/
#/ EXAMPLES:
#/
#/  Start the key2pdf server.  Do not respond to webhook events.  Useful for
#/  testing.
#/
#/     key2pdf start
#/
#/  Stop the key2pdf server:
#/
#/      key2pdf stop
#/
#/  Register a PAT with a human readable label.
#/
#/      key2pdf register-pat my-pat 38763662.....
#/
#/  Convert a single Keynote file.   Output PDF will be copied to /output,
#/  overwriting any files with the same name:
#/
#/      key2pdf --convert-file http://github.com/anorg/repo/blob/master/deck2.key
#/
#/  Convert a single Keynote file.   Output PDF will be committed to the source
#/  repository in the same location and on the same branch as the source Keynote:
#/
#/      key2pdf --convert-file http://github.com/anorg/repo/blob/master/deck2.key --commit-after-convert
#/
#/  Convert a single Keynote file.   Converted PDF will be committed to the
#/  source repository in the same location and on the same branch as the source
#/  Keynote and copied to Google Drive:
#/
#/      key2pdf --convert-file http://github.com/anorg/repo/blob/master/deck2.key --commit-after-convert --copy-to-gdrive
#/
#/  Convert all Keynote files in a repository on the default branch.  Converted
#/  PDFs will be copied to /output, overwriting any files with the same name:
#/
#/      key2pdf --convert-repo http://github.com/anorg/repo
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be copied to /output, overwriting any files with the same name:
#/
#/      key2pdf --convert-repo http://github.com/anorg/repo/tree/foo
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be committed to the source repository in the same location and on the
#/  same branch as the source Keynote:
#/
#/      key2pdf --convert-repo http://github.com/anorg/repo/tree/foo --commit-after-convert
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be committed to the source repository in the same location and on the
#/  same branch as the source Keynote and copied to Google Drive:
#/
#/      key2pdf --convert-repo http://github.com/anorg/repo/tree/foo --commit-after-convert --copy-to-gdrive
#/
#/
source_dir=$(cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
source "$source_dir/.env"
echo $USER_1_AUTH_TOKEN

CMD_JSON=""
FLAG_JSON=""
CMD_OPTION=0
for word in $@
do
    #echo "Current word: "$word" N: "$#" dollar1: "$1
     case "$word" in
        convert-file|convert-repo)
            CMD_JSON="{\"cmd\":\"${1}\","
            shift
            CMD_JSON=$CMD_JSON"\"option\":\"${1}\""
            CMD_OPTION=1
            continue
            ;;
        start)
            echo "Starting key2pdf server"
            clear
            cd ..
            node key2pdf.js
            exit 0
            ;;
        stop)
            echo "Attempting to stop key2pdf server"
            CMD_JSON="{\"cmd\":\"${1}\""
            #continue
            ;;
         register-pat)
            echo "Registering PAT"
            CMD_JSON="{\"cmd\":\"${1}\""
            shift
            CMD_JSON=$CMD_JSON",\"label\":\"${1}\",\"pat\":\"${2}\""
            break
            ;;
        --branch)
            shift
            shift
            CMD_JSON=$CMD_JSON",\"branch\":\"${1}\""
            echo "The --branch option is not yet supported.  Check back later!"
            echo $1" branch specified"
            CMD_OPTION=1
            continue
            ;;
        --commit-after-convert|--copy-to-gdrive)
            CMD_JSON=$CMD_JSON",\"${word:2}\":\"true\""
            #continue
            ;;
        *)
            #echo "CMD_OPTION: "$CMD_OPTION
            if [ $CMD_OPTION -eq 0 ]; then
                grep '^#/' <"$0" | cut -c 4-
                echo
                echo "Invalid argument: "$word
                exit 1
            else
                CMD_OPTION=0
            fi
      esac
done


CMD_JSON=$CMD_JSON"}"

echo "CMD_JSON: "$CMD_JSON

curl -X POST -d ${CMD_JSON} -H "Authorization: token ${USER_1_AUTH_TOKEN}" -H "User-Agent: key2pdf" -H 'Accept: application/vnd.github.v3.raw' ${KEY2PDF_URL}

exit 0

