var async = require('async')
  , scraper = require('./scraper')
  , url = process.argv[2]
  ;

function report(linkTracks, badLinks, failedLoads) {
    var orphaned = [];
    _.each(linkTracks, function(links, page) {
        if (! links.length) {
            orphaned.push(page);
        }
    });
    console.log('Orphaned Pages:');
    _.each(orphaned, function(orphan) {
        console.log('\t%s/%s', url, orphan);
    });
    if (badLinks.length && badLinks.length) {
        console.log("BAD LINKS:");
        console.log(badLinks);
    }
    if (failedLoads && failedLoads.length) {
        console.log("FAILED PAGE LOADS:");
        console.log(failedLoads);
    }
}

function scrapeWiki(wikiUrl) {
    console.log('** Starting scrape of %s **', wikiUrl);
    scraper.getAllWikiPages(wikiUrl, function(err, pages) {
        var linkTracks = {}
          , badLinks = []
          , failedLoads = []
          , pageFetchers = {}
          , processedPageCount = 0;

        if (err) {
            return console.error(err);
        }

        console.log('Found %s wiki pages.', pages.length);
        
        _.each(pages, function(page) {
            linkTracks[page] = [];
        });

        function createWikiPageFetcher(pageName) {
            return function(callback) {
                var pageUrl = wikiUrl + '/' + pageName;
                scraper.scrapeWikiLinks(pageUrl, function(err, links) {
                    if (err) {
                        failedLoads.push(pageName);
                    } else {
                        if (! linkTracks[pageName]) {
                            badLinks.push([pageName, page]);
                        } else {
                            linkTracks[pageName] = _.unique(linkTracks[pageName].concat(links));
                        }
                        processedPageCount++;
                        if (processedPageCount % 10 == 0) {
                            console.log('%s pages processed, %s to go...', processedPageCount, (pages.length - processedPageCount));
                            console.log('\t(%s failed page loads)', failedLoads.length);
                        }
                    }
                    callback();
                });
            };
        }

        _.each(pages, function(pageName) {
            pageFetchers[pageName] = createWikiPageFetcher(pageName);
        });

        function executeFetchers(fetchers, callback) {
            async.parallelLimit(fetchers, 10, function(err) {
                var loadFailures = [];
                if (err) {
                    callback(err);
                } else if (failedLoads.length) {
                    while (failedLoads.length) {
                        loadFailures.push(createWikiPageFetcher(failedLoads.shift()));
                    }
                    console.log('Re-fetching %s URLs...', loadFailures.length);
                    executeFetchers(loadFailures, callback);
                } else {
                    report(linkTracks, badLinks, failedLoads);
                }
            });

        };

        executeFetchers(pageFetchers, function(err) {
            if (err) {
                console.error("ERROR");
                console.error(err);
            } else {
                report(linkTracks, badLinks, failedLoads);
            }
        });

    });    
}

if (! url) {
    console.error('Usage: node index.js <wiki-url>');
} else {
    scrapeWiki(url);
}

