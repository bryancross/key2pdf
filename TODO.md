## TODO (Strategic vision)
- [x] Modify to accept a single argument, a URL to a keynote file in GitHub.  Transform just that file.
- [ ] Create Hubot script to allow users to send a single keynote for transformation. Provide feedback when complete
- [x] Create event driven server to respond to a webhook push event, transforming any keynotes in the push and storing the resulting PDFs in the repository
- [ ] Upload keynotes and PDF files to Box and/or Google Drive


## TODO (Tactical)

- [ ] Improve error handling
- [ ] Enable users to interactively create job-template.json when they run bootstrap.sh.
- [ ] Implement 'catalog' file of keynotes in the root of the repository.
- [ ] Definitively track down where promise rejection errors are trapped.
- [ ] Deal with removed files.
- [ ] Commit job logs back to repository
