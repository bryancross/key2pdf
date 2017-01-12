#!/usr/bin/env bash

if [ $# != 1 ]; then
    echo "Usage: testStatus.sh <jobID>"
    exit 1
fi

node ./test/testStatus.js $1