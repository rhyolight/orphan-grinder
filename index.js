var async = require('async')
  , _ = require('lodash')
  , scraper = require('./scraper')
  , argv = require('minimist')(process.argv.slice(2))
  , url
  , verbose = false
  , all = false
  , debug = false
  , now = new Date()
  ;

function printHelp() {
    console.log('\nOrphan Grinder Usage');
    console.log('====================');
    console.log('  node index.js <wiki-url> [options]');
    console.log('\nOptions:');
    console.log('  --verbose prints info about HTTP calls');
    console.log('  --all     prints info about found links as well as orphans');
    console.log('  --debug=N only fetches the first N wiki pages in the index');
}

function processArgs(args) {
    url = args._[0];
    commandArgs = args._.slice(1);
    if (args.help) {
        printHelp();
        process.exit();
    }
    if (! url) {
        console.error('\nNo wiki url was specified!');
        printHelp();
        process.exit(-1);
    }
    all = args.all;
    verbose = args.verbose;
    debug = args.debug;
}

function reverseLinks(linkTracks) {
    var reversed = {};
    _.each(linkTracks, function(links, name) {
        _.each(links, function(link) {
            if (! reversed[link]) {
                reversed[link] = [];
            }
            reversed[link].push(name);
        });
    });
    return reversed;
}

function getLinksFromPage(page, linkTracks) {
    var reversedLinks = reverseLinks(linkTracks)
      , links = reversedLinks[page]
      , selfIndex;
    // Page may not link to anything.
    if (! links) {
        links = [];
    }
    // Don't include linking to itself.
    selfIndex = links.indexOf(page);
    if (selfIndex > -1) {
        links.splice(selfIndex, 1);
    }
    return links;
}

function getDistantLinks(linkTracks, orphans) {
    var homeLinks = getLinksFromPage('home', linkTracks)
      , allPageNames = _.keys(linkTracks)
      , oneAway = []
      , withinOne
      , overOneAway
      , twoAway = []
      , withinTwo
      , overTwoAway
      ;

    // Going 1 level deep from /Home
    _.each(homeLinks, function(homeLink) {
        var childLinks = getLinksFromPage(homeLink, linkTracks);
        oneAway = oneAway.concat(childLinks);
        // Going 2 levels deep from /Home
        _.each(childLinks, function(childLink) {
            var grandchildLinks = getLinksFromPage(childLink, linkTracks);
            twoAway = twoAway.concat(grandchildLinks);
        });
    });

    withinOne = _.unique(homeLinks.concat(oneAway));
    withinTwo = _.unique(homeLinks.concat(oneAway, twoAway));

    overOneAway = _.difference(allPageNames, withinOne);
    overTwoAway = _.difference(allPageNames, withinTwo)

    // Strip out all the two-away pages from the one-away links
    overOneAway = _.difference(overOneAway, overTwoAway);

    // Strip out all the orphans from the over two away list
    overTwoAway = _.difference(overTwoAway, orphans);

    return {
        'Two clicks from Home': overOneAway
      , 'Over two clicks from Home': overTwoAway
    };
}

function report(linkTracks, badLinks) {
    var orphaned = []
      , orderedPages = []
      , distantLinks
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

    console.log('\n');
    console.log('# Orphan Grinder Report');
    console.log('\n> This report was generated by <https://github.com/rhyolight/orphan-grinder> for %s on %s.', url, now);

    console.log('\n');
    console.log('## Orphaned Pages (%s):\n', orphaned.length);
    _.each(orphaned, function(orphan) {
        console.log('- [%s](%s)', orphan, orphan.replace(':', '%3a'));
    });

    if (all) {
        distantLinks = getDistantLinks(linkTracks, orphaned);
        _.each(distantLinks, function(distant, title) {
            console.log('\n');
            console.log('## %s (%s):\n', title, distant.length);
            _.each(distant, function(distantLink) {
                console.log('- [%s](%s)', distantLink, distantLink.replace(':', '%3a'));
            });
        });

        console.log('\n');
        console.log('## Most Linked Pages\n');
        _.each(orderedPages.slice(0, 10), function(op) {
            console.log('- [%s](%s) (%s links)', op.name, op.name.replace(':', '%3a'), op.links.length);
        });

        console.log('\n');
        console.log('## All Linked Pages:\n');
        _.each(orderedPages, function(op) {
            if (op.links.length) {
                console.log('- [%s](%s) is linked from:', op.name, op.name.replace(':', '%3a'));
                _.each(op.links, function(link) {
                    console.log('  - [%s](%s)', link, link);
                });
            }
        });
    }

    if (badLinks.length && badLinks.length) {
        console.log('\n');
        console.log('## BAD LINKS (%s):\n', badLinks.length);
        _.each(badLinks, function(badLink) {
            console.log('- [%s](%s) ==> `%s`', badLink[0], badLink[0].replace(':', '%3a'), badLink[1]);
        });
    }
}

function scrapeWiki(wikiUrl) {
    console.log('***********************************************************');
    console.log('** Starting scrape of %s', wikiUrl);
    console.log('***********************************************************');
    console.log('\nLooking up wiki page index...');
    scraper.getAllWikiPages(wikiUrl, verbose, function(err, pages) {
        var linkTracks = {}
          , badLinks = []
          , failedLoads = []
          , pageFetchers = {}
          , processedPageCount = 0;

        if (err) {
            return console.error(err);
        }

        if (debug) {
            pages = pages.slice(0, debug);
        }

        console.log('Scraping %s wiki pages...', pages.length);
        
        _.each(pages, function(page) {
            linkTracks[page] = [];
        });

        function createWikiPageFetcher(pageName) {
            return function(callback) {
                var pageUrl = wikiUrl + '/' + pageName;
                scraper.scrapeWikiLinks(pageUrl, verbose, function(err, links) {
                    if (err) {
                        failedLoads.push(pageName);
                    } else {
                        _.each(links, function(link) {
                            if (link) {
                                if (!linkTracks[link]) {
                                    badLinks.push([pageName, link]);
                                } else {
                                    linkTracks[link].push(pageName);
                                }
                            }
                        });
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

processArgs(argv);
scrapeWiki(url);
