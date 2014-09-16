var jsdom = require('jsdom')
    _ = require('lodash')
    wikiLinkStartsWith = 'wiki/'
  ;

function Scraper() {}

function isIntraWikiLink(link) {
    return link
        && link.indexOf('#') != 0
        && link.indexOf('http:') != 0
        && link.indexOf('https:') != 0
        && link.indexOf('irc:') != 0
        && link.indexOf('mailto:') != 0;
}

function isLinkToItself(link, pageName) {
    return link.toLowerCase().indexOf(pageName) == 0;
}

function filterWikiLinks(links, pageName) {
    return _.filter(links, function(link) {
        return isIntraWikiLink(link) && ! isLinkToItself(link, pageName);
    });
}

function scrape(url, selector, attr, callback) {
    // console.log('Loading page %s...', url);
    jsdom.env(url, ["http://code.jquery.com/jquery.js"], function (errors, window) {
        if (errors) {
            return callback(errors);
        }
        var $ = window.$;
        var attrs = [];
        var $elements = $(selector);
        $elements.each(function() {
            attrs.push($(this).attr(attr));
        });
        callback(null, _.unique(attrs));
    });
}

function extractPageNames(links) {
    return _.map(links, function(link) {
        var parts, name;
        name = link.split('/').pop();
        if (name == 'wiki') {
            name = 'Home';
        }
        if (name.indexOf('#')) {
            name = name.split('#').shift();
        }
        name = name.toLowerCase();
        // Replace "%3a" with ":"
        name = name.replace('%3a', ':');
        return name;
    });
}

function scrapeWikiLinks(url, callback) {
    scrape(url, '#wiki-body .markdown-body a', 'href', function(err, links) {
        var pageName = url.split('/').pop(),
            pageLinks;
        if (err) {
            return callback(err);
        }
        pageLinks = extractPageNames(filterWikiLinks(links, pageName));
        // console.log('%s links found in %s', pageLinks.length, url);
        callback(null, pageLinks);
    });
}

function getAllWikiPages(wikiUrl, callback) {
    scrape(wikiUrl + '/_pages', '#wiki-content a', 'href', function(err, links) {
        var pageNames, orphanPageIndex;
        if (err) {
            return callback(err);
        }
        pageNames = extractPageNames(links);
        // If there is a wiki page called "orphans", we don't want to report the
        // links on that page. It could be a list of orphaned pages.
        orphanPageIndex = pageNames.indexOf('orphans');
        if (orphanPageIndex > -1) {
            pageNames.splice(orphanPageIndex, 1);
        }
        callback(null, pageNames);
    });
}

module.exports = {
    scrapeWikiLinks: scrapeWikiLinks
  , getAllWikiPages: getAllWikiPages
  , scrape: scrape
};