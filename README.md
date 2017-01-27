# key2pdf
Scripts and tools for transforming keynote files to PDF

key2pdf runs as a server listening for POST requests on the `/convert` and `/pushhook` endpoints.  
Calls to the `/convert` endpoint must include a `url` parameter.  Depending on the format of that URL, `key2pdf` will either:

 - Traverse a specified repository, finding all keynote files, converting them to PDF, and then uploading the resulting PDFs back into the repository
 - Find and convert a single keynote file

The `pushhook` endpoint is designed to respond to [GitHub Webhook](https://developer/.github.com/webhooks/) push events.

Converted PDFs are committed to GitHub in the same path as their source keynote files.

### Keynote Catalog

Two catalog of PDFs are maintained in the root of the directory:

 - `keynote-catalog.json`: JSON data structure containing catalog data
 - `keynote-catalog.md`: Formatted markdown document with links to the source keynote and PDF files, as well as other metadata.
   Descriptions are derived from commit messages.

### Example Catalog

### [deck10.key](https://api.github.com/bryancross/testrepo/blob/master/deck10.key)
#### [PDF rendition](https://api.github.com/bryancross/testrepo/blob/master/deck10.key.pdf)
|        |        |
|--------|--------|
|**Author:**|undefined|
|**Date:**|2017-01-14T05:11:56Z|
|**Size:**|1.5 MB|
|**Updated:**|2017-01-14T05:13:44Z|**Updated By:**|Jane Doe|
|**Description:**|Auto committed by key2pdf|

##### Updates:
| Date  | Committer | Description |
|-------|-----------|-------------|
|2017-01-14T05:11:56Z|John Doe|Auto committed by key2pdf|
|2017-01-14T05:13:44Z|Jane Doe|Auto committed by key2pdf|

Conversion is performed by the [CloudConvert API](https://cloudconvert.com/api).  You'll need a CloudConvert API token in order to use the service

## Setup
Clone the repository, then run `script/bootstrap.sh`

## Configuration
The bootstrap script creates the `/job` and `/log` directories.  You'll need to edit the values in `config/job-template.json` to
match your environment.  The only edits you'll need to make to run are in the `job.config` element:

```json
{
  "GitHubPAT":"<yourPAT>",
  "targetRepo":"testrepo",
  "targetBranch":"master",
  "targetHost":"github.com",
  "user":"bryancross",
  "authType":"oauth",
  "cloudConvertAPIToken":"<your CloudConvert API token>",
  "commitMsg":"Auto committed by key2pdf",
  "deleteTempDir":true,
  "userAgent":"key2pdf",
  "listenOnPort":3000,
  "callback": "",
  "debug":false,
  "jobsLimit":1000
}
```

| Parameter | Notes |
|-----------|-------|
| `GitHubPAT` | Properly scoped Personal Access Token for the target repository (`targetRepo`)|
| `targetRepo` | Repository to search for keynote files|
| `targetBranch` | Target branch to search for keynote files|
| `targetHost` | Host where `targetRepo` resides.  Just the hostname, don`t include `/api/v3` etc.|
| `user` | GitHub user corresponding to `GitHubPAT`|
| `authType` | Currently just `oauth`|
| `cloudConvertAPIToken` | API token allowing access to [CloudConvert](http://www.cloudconvert.com)|
| `commitMsg` | Commit message for commits of converted PDF files |
| `deleteTempDir` | If true, delete the temporary working directory on exit.  If false, don't.  Useful for seeing what's actually coming out of the repo or CloudConvert|
| `userAgent` | Value for the `user-agent` header sent to GitHub when the node-github API is initialized |
| `listenOnPort` | Port on which the server will listen |
| `callback` | endpoint URL to be called when a conversion job completes |
| `debug` | If true, create the node-github API instance with `debug=true`.  Otherwise false. |
| `jobsLimit` | Maximum number of completed jobs to keep in memory |


## Use

Run `script/server.sh`

If `key2pdf` launches successfully you'll see the following on the command line:

`2017-01-14T07:58:59.197-06:00:    Server listening on: http://localhost: 3000`

#### Endpoints
##### `POST http://<host>:<port>/convert`
##### Parameters
|Name|Type|Description|
|----|----|-----------|
|url  |string|Url to either a specific file in GitHub, or a repository, as explained below|

The `url` can point to a specific file on a specific branch, in which case only the specified file will be converted:

`https://github.com/bryancross/testrepo/blob/master/foo/deck1.key`

`{"url":"https://github.com/bryancross/testrepo/blob/master/foo/deck1.key"}`

or to an entire repository, in which case all keynote files in the repository will be converted:

  `https://github.com/bryancross/testrepo`

  `{"url":"https://github.com/bryancross/testrepo"}`

The server expects URLs to be constructed as they would be if you copied the URL from your browser while viewing a file or repository.

You can replace any value in the `job.config` by passing it in the HTTP request, e.g.,

`var options = "{GitHubPAT:<somepat>"` <br>
`var req = http.request(options, callback);` <br>

However, the components of the URL will be extracted and will overwrite the following `config` elements:

 - `targetHost`
 - `owner`
 - `targetRepo`
 - `targetBranch`

##### Returns
`convert` will return JSON containing a status message and an ID for the conversion job.  You can use this ID to retrieve the status
of your job.

`{"msg":"Conversion request recieved","jobID":"947f0f5d8cd92e414ac4056365ffe40cadaa75a9"}`

##### `POST http://<host>:<port>/status`
##### Parameters
|Name|Type|Description|
|----|----|-----------|
|jobID |string|ID of a job for which to retrieve status info|

##### Returns

The endpoint returns JSON containing all status messages generated by
the conversion process up to the point of the call, as well as the current config parameters, a list of files being converted and, if
the process has moved far enough, PDF files created and uploaded to GitHub:

```json
{
  "jobID": "fba65bc7c2c07f146ef81207748cba179a950fce",
  "StartTime": "2017-01-08T12:40:32.533-06:00",
  "msgs": [  // Array of messages emitted by the logger during the conversion run   
    {
      "time": "2017-01-08T12:40:32.534-06:00",
      "msg": "Path: foo/deck1.key"
    },
    {
      "time": "2017-01-08T12:40:32.534-06:00",
      "msg": "Temp directory: ./job/fba65bc7c2c07f146ef81207748cba179a950fce"
    },
    {
      "time": "2017-01-08T12:40:32.752-06:00",
      "msg": "Current commit SHA: 8865ec18bbfb563ee80d15213f518f1b6bd48b45"
    }
  ],
  "config": { // The config, as modified by any URLs or parameters passed in
    "GitHubPAT": "<your properly scoped GitHub PAT>",
    "targetRepo": "testrepo",
    "targetBranch": "master",
    "targetHost": "api.github.com",
    "owner": "bryancross",
    "user": "bryancross",
    "authType": "oauth",
    "cloudConvertAPIToken": "XXXXXXXXXXXXXXXXXXXXXXXXXX",
    "commitMsg": "Auto committed by key2pdf",
    "deleteTempDir": false,
    "userAgent": "key2pdf",
    "listenOnPort": 3000,
    "callback": "http://localhost:3001/status",
    "debug": false,
    "filePath": "foo/deck2.key", // The path in the repository converted by this run
    "pathPrefix": ""
  },
  "files": [ // Files identified and sent for conversion
    {
      "path": "foo/deck1.key",
      "mode": "100644",
      "type": "blob",
      "sha": "eb1810b784c492d814020a8c0b84e7634e44c4a7",
      "size": 1404238,
      "url": "https://api.github.com/repos/bryancross/testrepo/git/blobs/eb1810b784c492d814020a8c0b84e7634e44c4a7"
    }
  ],
  "PDFs": [ // Resulting PDFs committed to the repo
    {
      "path": "foo/deck1.key.pdf",
      "type": "blob",
      "mode": "100644",
      "sha": "e920e4bdbaf733383acdbb236a867e8ec3877b6f",
      "url":"https://api.github.com/repos/bryancross/testrepo/git/blobs/e920e4bdbaf733383acdbb236a867e8ec3877b6f"
    }
  ],
  "errors": [  //Array of any error messages encountered during the conversion run
    {
    "errorMessage": "", //The last error message received
    "status": "Complete",
    }
  ],
  "tempDir": "./job/fba65bc7c2c07f146ef81207748cba179a950fce",
  "endTime": "2017-01-08T12:40:42.330-06:00",
  "duration": 9.797
}
```

##### `POST http://<host>:<port>/pushhook`
##### Parameters
|Name|Type|Description|
|----|----|-----------|
|commit |object|GitHub [commit object](https://developer.github.com/v3/activity/events/types/#pushevent).|

This endpoint is designed to receive GitHub webhook push event payloads.  
[Configure a webhook](https://developer.github.com/webhooks/creating/) pointing to this endpoint.  Functionality is
identical to the `/convert` endpoint.


##### Returns

`pushhook` will return JSON containing a status message and an ID for the conversion job.  You can use this ID to retrieve the status
of your job.

`{"msg":"Conversion request recieved","jobID":"947f0f5d8cd92e414ac4056365ffe40cadaa75a9"}`


#### Logging
The job object is written out to the `/log` directory.  The filename is the JobID.

#### Temporary Directories
Job data are stored in a directory in the `/job` directory.  The directory name is the JobID.  If `config.deleteTempDir` = `true`,
 this directory will be deleted when the conversion job is complete.

## Testing

You can simulate requests to `key2pdf` endpoints.  

Run `script/testConvert.sh` to test the `convert` endpoint.  This script will fire requests based on
parameters configured in `test/test-params.json`.  Each of the keys in the `testCases` array replace the matching
key in `key2pdf`s global config.  The host, port, and endpoint determine where the HTTP POST request is sent.

```json
{
  "host":"http://localhost",
  "port":3000,
  "endpoint":"convert",
  "testCases":[
    {
      "GitHubPAT":"<your properly scoped PAT>",
      "url":"https://github.com/bryancross/testrepo/blob/master/foo/deck1.key",
      "callback":"http://localhost:3001/status"
    },
    {
    "GitHubPAT":"<your properly scoped PAT>",
    "url":"https://github.com/bryancross/testrepo/blob/master/foo/deck2.key",
    "callback":"http://localhost:3001/status"
    }
  ]
}
```

Run `script/testPushhook.sh` to test the `pushhook` endpoint.  This script sends a request to the endpoint.  The payload
 is the contents of `test/test-commit.json`.  

### Simulated callback

If you want to test callback functionality, you can run `test/testCallback.sh`.  This launches a simple server that
receives HTTP POST events and prints certain components of them to the console.

```
*************************
2017-01-13T23:13:45.906-06:00
Callback received for job: 70647654761f47d6dfa9cbc8c33d99521a53852b status: Success
*************************
```
