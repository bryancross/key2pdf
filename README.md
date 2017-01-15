# key2pdf
Scripts and tools for transforming keynote files to PDF

key2pdf runs as a server listening for POST requests on the `/convert` and `/pushhook` endpoints.  
Calls to the `/convert` endpoint must include a `url` parameter.  Depending on the format of that URL, `key2pdf` will either:

 - Traverse a specified repository, finding all keynote files, converting them to PDF, and then uploading the resulting PDFs back into the repository
 - Find and convert a single keynote file
 
The `pushhook` endpoint is designed to respond to GitHub webhook push events. 

Converted PDFs are committed to GitHub in the same path as their source keynote files.

###Keynote Catalog

Two catalog of PDFs are maintained in the root of the directory: 
 
 - `keynote-catalog.json`: JSON data structure containing catalog data
 - `keynote-catalog.md`: Formatted markdown document with links to the source keynote and PDF files, as well as other metadata.
   Descriptions are derived from commit messages. 
   
   ###Example Catalog
   
   

   > ### [deck10.key](https://api.github.com/bryancross/testrepo/blob/master/deck10.key)
   > #### [PDF rendition](https://api.github.com/bryancross/testrepo/blob/master/deck10.key.pdf)
   > |        |        |
   > |--------|--------|
   > |**Author:**|undefined|
   > |**Date:**|2017-01-14T05:11:56Z|
   > |**Size:**|1.5 MB|
   > |**Updated:**|2017-01-14T05:13:44Z|**Updated By:**||
   > |**Description:**|Auto committed by key2pdf
   > 
   > ##### Updates:
   > | Date  | Committer | Description |
   > |-------|-----------|-------------|
   > |2017-01-14T05:11:56Z|undefined|Auto committed by key2pdf|
   > |2017-01-14T05:13:44Z|undefined|Auto committed by key2pdf|

Conversion is performed by the [CloudConvert API](https://cloudconvert.com/api).  You'll need a cloudconvert API token in order to use the service

## Setup
Clone the repository, then run 
`script/bootstrap.sh`

## Configuration
The bootstrap script creates the `/job` and `/log` directories.  You'll need to edit the values in `config/job-template.json` to 
match your environment.  The only edits you'll need to make to run are in the `job.config` element:

`{`<br>
&nbsp;&nbsp;&nbsp;   `"GitHubPAT":"<yourPAT>"` <br>
&nbsp;&nbsp;&nbsp;   `,"targetRepo":"testrepo"` <br>
&nbsp;&nbsp;&nbsp;   `,"targetBranch":"master"` <br>
&nbsp;&nbsp;&nbsp;`,"targetHost":"github.com"` <br>
&nbsp;&nbsp;&nbsp;   `,"user":"bryancross"` <br>
&nbsp;&nbsp;&nbsp;   `,"authType":"oauth"` <br>
&nbsp;&nbsp;&nbsp;  `,"cloudConvertAPIToken":"<your CloudConvert API token>"` <br>
&nbsp;&nbsp;&nbsp;  `,"commitMsg":"Auto committed by key2pdf"` <br>
&nbsp;&nbsp;&nbsp;  `,"deleteTempDir":true` <br>
&nbsp;&nbsp;&nbsp;  `,"userAgent":"key2pdf"` <br>
&nbsp;&nbsp;&nbsp;  `,"listenOnPort":3000` <br>
&nbsp;&nbsp;&nbsp;     `,"callback": ""` <br>
&nbsp;&nbsp;&nbsp;      `,"debug":false` <br>
&nbsp;&nbsp;&nbsp;      `,"jobsLimit":1000` <br>
`}`

| Parameter | Notes |
|-----------|-------|
| `GitHubPAT` | Properly scoped Personal Access Token for the target repository (`targetRepo`)|
| `targetRepo` | Repository to search for keynote files|
| `targetBranch` | Target branch to search for keynote files|
| `targetHost` | Host where `targetRepo` resides.  Just the hostname, don`t include `/api/v3` etc.|
| `user` | GitHub user corresponding to `GitHubPAT`|
| `authType` | Currently just `oauth`|
| `cloudConvertAPIToken` | API token allowing access to [cloudconvert.com](http://www.cloudconvert.com)|
| `commitMsg` | Commit message for commits of converted PDF files | 
| `deleteTempDir` | If true, delete the temporary working directory on exit.  If false, don't.  Useful for seeing what's actually coming out of the repo or cloudconvert|
| `userAgent` | Value for the `user-agent` header sent to GitHub when the node-github API is initialized | 
| `listenOnPort` | Port on which the server will listen | 
| `callback` | endpoint URL to be called when a conversion job completes | 
| `debug` | If true, create the node-github API instance with `debug=true`.  Otherwise false. |
| `jobsLimit` | Maximum number of completed jobs to keep in memory |

###Using ngrok to proxy webhooks to your laptop

If you are using a computer You can use [ngrok](https://ngrok.com/) to quickly and easy setup a proxy server to redirect webhooks from GitHub.com
to expose your computer behind NAT or a firewall:
 
 1. Install ngrok
 2. Run tunnel.sh
 
 ngrok generates output showing your temporary public internet URL.`  <br>
 <br>
 `ngrok by @inconshreveable                                       (Ctrl+C to quit)`<br>
<br>                                                                                 
 `Session Status                online`<br>                                            
 `Version                       2.1.18`<br>                                            
 `Region                        United States (us)`<br>                                
 `Web Interface                 http://127.0.0.1:4040`<br>                             
 `Forwarding                    __https://d9036a49.ngrok.io__ -> localhost:3000` <-- Configure your webhook with this URL <br>         
<br>                                                                                 
 `Connections                   ttl     opn     rt1     rt5     p50     p90`<br>       
                               `360     0       0.00    0.00    73.83   151.24`<br>   
Note that this URL will change every time you launch ngrok, so be sure to reconfigure your webhook when you restart it.                               
                               
## Use

Run `script/server.js`

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

`{` <br> 
&nbsp;&nbsp;&nbsp;`"jobID": "fba65bc7c2c07f146ef81207748cba179a950fce",` <br> 
&nbsp;&nbsp;&nbsp;`"StartTime": "2017-01-08T12:40:32.533-06:00",` <br> 
&nbsp;&nbsp;&nbsp;`"msgs": [  //Array of messages emitted by the logger during the conversion run` <br>  
&nbsp;&nbsp;&nbsp;`{` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"time": "2017-01-08T12:40:32.534-06:00",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"msg": "Path: foo/deck1.key"` <br> 
&nbsp;&nbsp;&nbsp;`},` <br> 
&nbsp;&nbsp;&nbsp;`{` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"time": "2017-01-08T12:40:32.534-06:00",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"msg": "Temp directory: ./job/fba65bc7c2c07f146ef81207748cba179a950fce"` <br> 
&nbsp;&nbsp;&nbsp;`},` <br> 
&nbsp;&nbsp;&nbsp;`{` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"time": "2017-01-08T12:40:32.752-06:00",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"msg": "Current commit SHA: 8865ec18bbfb563ee80d15213f518f1b6bd48b45"` <br> 
&nbsp;&nbsp;&nbsp;`},` <br> 
&nbsp;&nbsp;&nbsp;`<<etc>>` <br> 
&nbsp;&nbsp;&nbsp;`],` <br> 
&nbsp;&nbsp;&nbsp;`"config": { //The config, as modified by any URLs or parameters passed in` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"GitHubPAT": "<your properly scoped GitHub PAT>",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"targetRepo": "testrepo",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"targetBranch": "master",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"targetHost": "api.github.com",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"owner": "bryancross",` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"user": "bryancross",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"authType": "oauth",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"cloudConvertAPIToken": "O_unX3l0OehzUhKfNOz_fczDugrne7ssX-dlD971NYIaLAD0MIYRxIveRf9KN2HWqvmSt2QwoYWt0ycf5auc7Q",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"commitMsg": "Auto committed by key2pdf",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"deleteTempDir": false,` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"userAgent": "key2pdf",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"listenOnPort": 3000,` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"callback": "http://localhost:3001/status",` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"debug": false,` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"filePath": "foo/deck2.key", // The path in the repository converted by this run` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"pathPrefix": ""` <br> 
&nbsp;&nbsp;&nbsp;`},` <br> 
&nbsp;&nbsp;&nbsp;`"files": [ // Files identified and sent for conversion` <br> 
&nbsp;&nbsp;&nbsp;`{` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"path": "foo/deck1.key",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"mode": "100644",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"type": "blob",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"sha": "eb1810b784c492d814020a8c0b84e7634e44c4a7",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"size": 1404238,` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"url":"https://api.github.com/repos/bryancross/testrepo/git/blobs/eb1810b784c492d814020a8c0b84e7634e44c4a7"` <br> 
&nbsp;&nbsp;&nbsp;`}` <br> 
&nbsp;&nbsp;&nbsp;`],` <br> 
&nbsp;&nbsp;&nbsp;`"PDFs": [ // Resulting PDFs committed to the repo` <br> 
&nbsp;&nbsp;&nbsp;`{` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"path": "foo/deck1.key.pdf",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"type": "blob",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"mode": "100644",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"sha": "e920e4bdbaf733383acdbb236a867e8ec3877b6f",` <br> 
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`"url":"https://api.github.com/repos/bryancross/testrepo/git/blobs/e920e4bdbaf733383acdbb236a867e8ec3877b6f"` <br> 
&nbsp;&nbsp;&nbsp;`}` <br> 
&nbsp;&nbsp;&nbsp;`],` <br> 
&nbsp;&nbsp;&nbsp;`"errors":[]  //Array of any error messages encountered during the conversion run` <br>
&nbsp;&nbsp;&nbsp;`"errorMessage:"" //The last error message received` <br> 
&nbsp;&nbsp;&nbsp;`"status": "Complete",` <br> 
&nbsp;&nbsp;&nbsp;`"tempDir": "./job/fba65bc7c2c07f146ef81207748cba179a950fce",` <br> 
&nbsp;&nbsp;&nbsp;`"endTime": "2017-01-08T12:40:42.330-06:00",` <br> 
&nbsp;&nbsp;&nbsp;`"duration": 9.797` <br> 
`}` <br> 

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


##Logging
The job object is written out to the `/log` directory.  The filename is the JobID.
 
##Temporary Directories
Job data are stored in a directory in the `/job` directory.  The directory name is the JobID.  If `config.deleteTempDir` = `true`, 
 this directory will be deleted when the conversion job is complete.

##Testing

You can simulate requests to `key2pdf` endpoints.  

Run `script/testConvert.sh` to test the `convert` endpoint.  This script will fire requests based on 
parameters configured in `test/test-params.json`.  Each of the keys in the `testCases` array replace the matching 
key in `key2pdf`s global config.  The host, port, and endpoint determine where the HTTP POST request is sent.

`{` <br>
&nbsp;&nbsp;&nbsp; `   "host":"http://localhost"` <br>
&nbsp;&nbsp;&nbsp; `  ,"port":3000` <br>
&nbsp;&nbsp;&nbsp;`  ,"endpoint":"convert"` <br>
&nbsp;&nbsp;&nbsp;`  ,"testCases":[` <br>
&nbsp;&nbsp;&nbsp;`    {` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`       "GitHubPAT":"<your properly scoped PAT>"` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`      ,"url":"https://github.com/bryancross/testrepo/blob/master/foo/deck1.key"` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`      ,"callback":"http://localhost:3001/status"` <br>
&nbsp;&nbsp;&nbsp;`    }` <br>
&nbsp;&nbsp;&nbsp;`    ,  {` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`    "GitHubPAT":"<your properly scoped PAT>"` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`  ,"url":"https://github.com/bryancross/testrepo/blob/master/foo/deck2.key"` <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`  ,"callback":"http://localhost:3001/status"` <br>
&nbsp;&nbsp;&nbsp;`  }` <br>
&nbsp;&nbsp;&nbsp;`  ]` <br>
`}` <br> 

Run `script/testPushhook.sh` to test the `pushhook` endpoint.  This script sends a request to the endpoint.  The payload
 is the contents of `test/test-commit.json`.  

### Simulated callback

If you want to test callback functionality, you can run `test/testCallback.sh`.  This launches a simple server that 
receives HTTP POST events and prints certain components of them to the console.

`*************************`
`2017-01-13T23:13:45.906-06:00`
`Callback received for job: 70647654761f47d6dfa9cbc8c33d99521a53852b status: Success`
`*************************`
