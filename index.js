var async = require('async')
  , scraper = require('./scraper')
  , url = process.argv[2]
  ;

function report(linkTracks, badLinks) {
    var orphaned = []
      , orderedPages = []
      ;
    _.each(linkTracks, function(links, page) {
        if (! links.length) {
            orphaned.push(page);
        }
        orderedPages.push({name: page, links: links});
    });
    orderedPages = _.sortBy(orderedPages, function(op) {
        return op.links.length;
    }).reverse();

    console.log('\n\n==============================================================');
    console.log('Orphan Grinder Report for %s', url);
    console.log('==============================================================');

    console.log('\nMost Linked Pages:');
    _.each(orderedPages.slice(0, 10), function(op) {
        console.log('✪   %s/%s (%s links)', url, op.name, op.links.length);
    });

    console.log('\nAll Linked Pages:');
    console.log('=================');
    _.each(orderedPages, function(op) {
        if (op.links.length) {
            console.log('%s/%s is linked from:', url, op.name);
            _.each(op.links, function(link) {
                console.log('\t✪ %s/%s', url, link);
            });
        }
    });

    console.log('\nOrphaned Pages:');
    console.log('===============');
    _.each(orphaned, function(orphan) {
        console.log('✪   %s/%s', url, orphan);
    });

    if (badLinks.length && badLinks.length) {
        console.log('\nBAD LINKS:');
        console.log('==========');
        _.each(badLinks, function(badLink) {
            console.log('✘   %s ==> %s', badLink[0], badLink[1]);
        });
    }
}

function scrapeWiki(wikiUrl) {
    console.log('***********************************************************');
    console.log('** Starting scrape of %s', wikiUrl);
    console.log('***********************************************************');
    console.log('\nLooking up wiki page index...');
    scraper.getAllWikiPages(wikiUrl, function(err, pages) {
        var linkTracks = {}
          , badLinks = []
          , failedLoads = []
          , pageFetchers = {}
          , processedPageCount = 0;

        if (err) {
            return console.error(err);
        }

        // pages = pages.slice(0, 3);

        console.log('Scraping %s wiki pages...', pages.length);
        
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
                        _.each(links, function(link) {
                            if (!linkTracks[link]) {
                                badLinks.push([pageUrl, link]);
                            } else {
                                linkTracks[link].push(pageName);
                            }
                        });
                        // linkTracks[pageName] = _.unique(linkTracks[pageName].concat(links));
                        processedPageCount++;
                        if (processedPageCount % 10 == 0) {
                            console.log('%s% done... %s pages processed, %s to go...', (Math.round((processedPageCount / pages.length) * 100)), processedPageCount, (pages.length - processedPageCount));
                            console.log('\t(%s failed page loads, %s bad links)', failedLoads.length, badLinks.length);
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
                report(linkTracks, badLinks);
            }
        });

    });    
}

if (! url) {
    console.error('Usage: node index.js <wiki-url>');
} else {
    scrapeWiki(url);
}

