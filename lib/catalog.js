/**
 * Created by bryancross on 1/20/17.
 */


var catalog = function(){};
var cleanup = null;
var b64 = require('js-base64').Base64;
var logger = require('./logger.js');
var arrayUtil = require('./arrayUtil.js');
catalog.prototype.updateCatalog = function(job, callback)
{
        this.cleanup = callback;
        job.github.repos.getContent({
                owner: job.config.owner,
                repo: job.config.targetRepo,
                path: "keynote-catalog.json"
            }
        ).then(function (err, res) {
            logger.log("Got keynote-catalog.json: " + err.sha, job);
            var cat = b64.decode(err.content);
            job.catalog = JSON.parse(cat);
            job.catalog.sha = err.sha;
            this.updateJSONCatalog(job);
        }).catch(function (err) {
            logger.log("error downloading keynote-catalog.json",job,"Updating catalog", err);
            job.catalog = [];
            job.catalog.sha = "";
            this.updateJSONCatalog(job);
        })
};

    catalog.prototype.updateJSONCatalog = function(job) {
        var catEntry = null;
        if(job.catalog.sha === "")
        {
            job.catalog = new Array();
        }
        job.files.forEach(function (keynote) {
            var index = arrayUtil.findValueInArray(job.catalog, keynote.path, "path");
            //Make a new entry
            if (!index && index != 0) {
                catEntry = new Object();
                //catEntry = require("../config/catalog-entry-template.json");
                catEntry.path = keynote.path;
                catEntry.bloburl = keynote.url
                catEntry.sha = keynote.sha;
                catEntry.size = keynote.size;
                catEntry.url = "https://" + (job.config.targetHost != 'api.github.com' ? job.config.targetHost : job.config.targetHost.substring(4)) + "/" + job.config.owner + "/" + job.config.targetRepo + "/blob/" + job.config.targetBranch + "/" + keynote.path
                catEntry.PDFurl = catEntry.url + ".pdf"
                catEntry.committer = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username;
                catEntry.commitDate = typeof job.config.pushCommit === 'undefined' ? job.newCommit.committer.date : job.config.pushCommit.head_commit.timestamp;
                catEntry.originalCommitMsg = typeof job.config.pushCommit === 'undefined' ? job.newCommit.message : job.config.pushCommit.head_commit.message;
                catEntry.commitMessages = [{commitDate:catEntry.commitDate,committer:catEntry.committer,msg:catEntry.originalCommitMsg}];
                job.catalog.push(catEntry);
            }
            else
            //Add commit message to existing entry
            {
                job.catalog[index].size = keynote.size;
                job.catalog[index].sha = keynote.sha
                job.catalog[index].updatedBy = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username ;
                job.catalog[index].updated = typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.date : job.config.pushCommit.head_commit.timestamp;
                job.catalog[index].commitMessages.push({
                    commitDate: typeof job.config.pushCommit === 'undefined' ? job.newCommit.committer.date : job.config.pushCommit.head_commit.timestamp
                    , committer: typeof job.config.pushCommit === 'undefined' ? job.newCommit.author.name : job.config.pushCommit.head_commit.author.username
                    , msg: typeof job.config.pushCommit === 'undefined' ? job.newCommit.message : job.config.pushCommit.head_commit.message
                })
            }
        })
        var catContent = b64.encode(JSON.stringify(job.catalog));
        if(typeof job.catalog.sha === 'undefined' || job.catalog.sha === "")
        {

            job.github.repos.createFile({owner:job.config.owner,repo:job.config.targetRepo,path:"keynote-catalog.json",message:job.config.commitMsg,content:catContent})
                .then(function(err, res)
                {
                    this.updateMarkdownCatalog(job);
                })
        }
        else
        {
            job.github.repos.updateFile({owner:job.config.owner, repo:job.config.targetRepo, path:"keynote-catalog.json",message:job.config.commitMsg,content:catContent,sha:job.catalog.sha})
                .then(function(err,res)
                {
                    this.updateMarkdownCatalog(job);
                })
        }

    }

    catalog.prototype.updateMarkdownCatalog = function(job)
    {
        var output = "";
        job.catalog.forEach(function(cat)
        {
            output = output + "### [" + cat.path + "](" + cat.url + ")\n" ;
            output = output + "#### [PDF rendition](" + cat.PDFurl + ")\n";
            output = output + "|        |        |\n";
            output = output + "|--------|--------|\n";
            output = output + "|**Author:**|" + cat.committer + "|\n";
            output = output + "|**Date:**|" + cat.commitDate + "|\n";
            output = output + "|**Size:**|" + (cat.size/1024/1024).toString().split(".")[0] + "." + (cat.size/1024/1024).toString().split(".")[1].substring(1,2) + " MB|\n";
            output = output + "|**Updated:**|" + (typeof cat.updated != 'undefined' ? cat.updated : "|\n");
            output = output + "|**Updated By:**|" + (typeof cat.updater != 'undefined' ? cat.updater : "|\n");
            output = output + "|**Description:**|" + cat.originalCommitMsg + "\n";
            output = output + "\n";
            output = output + "##### Updates:\n";
            output = output + "| Date  | Committer | Description |\n";
            output = output + "|-------|-----------|-------------|\n"

            cat.commitMessages.forEach(function(msg)
            {
                output = output + "|" + msg.commitDate + "|";
                output = output + msg.committer + "|";
                output = output + msg.msg + "|\n";
            });
        });
        job.markdownCatalog = output;
        this.uploadCatalog(job)
    }

    catalog.prototype.uploadCatalog = function (job)
    {
        var b64content = b64.encode(job.markdownCatalog)
        job.github.repos.getContent({owner:job.config.owner,
            repo:job.config.targetRepo,
            path:"keynote-catalog.md"}
        ).then(function(err,res){
            logger.log("Found Markdown Catalog" + err.sha, job);

            job.github.repos.updateFile({owner:job.config.owner, repo:job.config.targetRepo, path:"keynote-catalog.md",message:job.config.commitMsg,content:b64content,sha:err.sha})
                .then(function(err,res)
                {
                    logger.log("Markdown catalog updated", job,"Finishing");
                    delete job.catalog;
                    delete job.markdownCatalog;
                    //cleanup(job);
                    this.cleanup.cleanup(job);
                })
        }).catch(function(err){
            job.github.repos.createFile({owner:job.config.owner,repo:job.config.targetRepo,path:"keynote-catalog.md",message:job.config.commitMsg,content:b64content})
                .then(function(err,res)
                {
                    logger.log("Markdown catalog uploaded", job,"Finishing");
                    delete job.catalog;
                    delete job.markdownCatalog;
                    //cleanup(job);
                    this.cleanup.cleanup(job);
                })

        })
    };

module.exports = new catalog();