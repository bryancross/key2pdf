#!/usr/bin/env bash

#/ Usage: key2pdf.sh cmd <option> <flags>
#/
#/ <DESCRIPTION>
#/
#/ CONFIGURATION VARIABLES (set in ./config/job-template.json):
#/
#/  VAR                       DESC
#/
#/ OPTIONS:
#/  start	Start the key2pdf server
#/
#/  stop	Stop the key2pdf server
#/
#/  process-webhooks	    If present, key2pdf will respond to webhooks on the
#/                          /pushhook endpoint
#/
#/  param-file              Path to a JSON file containing one or more keys
#/                          whose values will overwrite matching keys in
#/                          job-template.json
#/
#/  keynote_url             URL to a single Keynote file to be converted
#/
#/  repository_url          URL to a repository. All keynotes found in the
#/                          repository on the specified branch will be converted
#/
#/  commit-after-convert    If present, converted PDF files will be committed to
#/                          the source repo in the same location and on the
#/                          same branch as the source Keynote
#/
#/  copy-to-gdrive          If present, converted PDF files will be uploaded to
#/                          Google Drive
#/
#/  branch                  If present, key2pdf will search for the the
#/                          specified Keynote file(s) on the specified branch.
#/                          If not present, key2pdf will use the default branch
#/                          for the repository
#/
#/ EXAMPLES:
#/
#/  Start the key2pdf server.  Do not respond to webhook events.  Useful for
#/  testing.
#/
#/     key2pdf start
#/
#/  Start the key2pdf server.  Do not respond to webhook events.  Provide a JSON
#/  file containing configuration parameters to override defaults.
#/
#/     key2pdf start --param-file my-config.json
#/
#/  Start the key2pdf server and listen for webhook events:
#/
#/      key2pdf start process-webhooks
#/
#/  Stop the key2pdf server:
#/
#/      key2pdf stop
#/
#/  Convert a single Keynote file.   Output PDF will be copied to /output,
#/  overwriting any files with the same name:
#/
#/      key2pdf --convert-file http://github.com/bryancross/testrepo/deck2.key
#/
#/  Convert a single Keynote file.   Output PDF will be committed to the source
#/  repository in the same location and on the same branch as the source Keynote:
#/
#/      key2pdf --convert-file http://github.com/bryancross/testrepo/deck2.key --commit-after-convert
#/
#/  Convert a single Keynote file.   Converted PDF will be committed to the
#/  source repository in the same location and on the same branch as the source
#/  Keynote and copied to Google Drive:
#/
#/      key2pdf --convert-file http://github.com/bryancross/testrepo/deck2.key --commit-after-convert --copy-to-gdrive
#/
#/  Convert all Keynote files in a repository on the default branch.  Converted
#/  PDFs will be copied to /output, overwriting any files with the same name:
#/
#/      key2pdf --convert-repo http://github.com/bryancross/testrepo
#/
#/  Convert all Keynote files in a repository on the default branch.  Converted
#/  PDFs will be copied to /output, overwriting any files with the same name:
#/
#/      key2pdf --convert-repo http://github.com/bryancross/testrepo
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be copied to /output, overwriting any files with the same name:
#/
#/      key2pdf --convert-repo http://github.com/bryancross/testrepo --branch foo
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be committed to the source repository in the same location and on the
#/  same branch as the source Keynote:
#/
#/      key2pdf --convert-repo http://github.com/bryancross/testrepo --commit-after-convert --branch foo
#/
#/  Convert all Keynote files in a repository on branch foo.  Converted PDFs
#/  will be committed to the source repository in the same location and on the
#/  same branch as the source Keynote and copied to Google Drive:
#/
#/      key2pdf --convert-repo http://github.com/bryancross/testrepo --commit-after-convert --copy-to-gdrive --branch foo
#/
#/
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

        start|stop)
            CMD_JSON="{\"cmd\":\"${1}\""
            #continue
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
            FLAG_JSON=$FLAG_JSON",\"${word:2}\""
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

if [[ -z $FLAG_JSON ]]; then
    CMD_JSON=$CMD_JSON"}"
else
    CMD_JSON=$CMD_JSON","
    CMD_JSON=$CMD_JSON"\"flags\":[${FLAG_JSON:1}]}"
fi
#CMD_JSON="{\"args\":"$CMD_JSON"}"

echo "CMD_JSON: "$CMD_JSON

curl -X POST -d ${CMD_JSON} -H "Authorization: token ${USER_1_AUTH_TOKEN}" -H "User-Agent: key2pdf" -H 'Accept: application/vnd.github.v3.raw' http://localhost:3000/key2pdf

exit 0

