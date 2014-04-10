
// This script will parse a Wordpress Export XML file and generate individual
//  markdown files (and an html file containing any comments) for each post.

var _ = require("underscore");
var moment = require('moment');
var xml2js = require("xml2js");
var fs = require('fs');
var path = require('path');
var args = process.argv; // 0=node, 1=path/to/script.js

if(args.length < 5) {
  console.error("Usage: node wp2jekyll.js path/to/wp-dump.xml path/to/_posts path/to/_includes");
  return;
}

var xmlFilePath = args[2];
var postsOutDir = args[3];
var commentsOutDir = args[4];
var parseDateFormat = "YYYY-MM-DD HH:mm:ss";

// Read XML file
fs.readFile(xmlFilePath, 'utf8', function (err,xml) {
  if (err) {
    return console.error(err);
  }
  // Parse XML file
  //  Note: XML attributes are accessed via $ (see cat.$.domain)
  xml2js.parseString(xml, function (err, result) {
    if (err) {
      return console.error(err);
    }

    // Load markdown templates
    var postTemplate = fs.readFileSync(path.join(__dirname, 'template_post.markdown'), 'utf8');
    var commentTemplate = fs.readFileSync(path.join(__dirname, 'template_comment.html'), 'utf8');

    console.log("=============================");
    console.log("  Generating Markdown Files");
    console.log("=============================");

    // Each Post...
    var urls = {};
    var posts = result.rss.channel[0].item;
    _.each(posts, function(postXml) {
      // Write post (and any comments) to file(s)
      var wpPost = new WpPost(postXml).writePost(postsOutDir, postTemplate);
      if(wpPost.comments.length > 0) {
        wpPost.writeComments(commentsOutDir, commentTemplate);
      }
      urls[wpPost.templateData["post_id"]] = wpPost.url;
    });

    // Display URLs (for shorturl)
    console.log("=========================");
    console.log("  URLs (for shorturl)");
    console.log("=========================");
    _.each(urls, function(url, post_id) {
      console.log('$this->blogIds["'+post_id+'"] = "'+url+'";');
    });

  });
;});

var WpPost = function(postXml)
{
    this.templateData["title"] = postXml["title"][0].replace(/\"/g, "\\\"");
    this.templateData["post_id"] = postXml["wp:post_id"][0];
    this.templateData["pubdate"] = postXml["wp:post_date_gmt"][0];
    this.templateData["excerpt"] = postXml["excerpt:encoded"][0].replace(/<p>(.+)<\/p>/, "$1");
    this.templateData["content"] = postXml["content:encoded"][0];

    // Build filenames
    var slug = postXml['wp:post_name'][0];
    var pubdate = moment(this.templateData["pubdate"], parseDateFormat);
    this.postFileName = pubdate.format("YYYY-MM-DD") + '-' + slug + '.markdown';
    this.commentsFileName = 'comments-' + this.templateData["post_id"] + '.html';

    // Build URL (for shorturl)
    this.url = pubdate.format("/YYYY/MM/") + slug;

    // Get categories
    this.loadCategories(postXml);

    // Get Comments
    this.loadComments(postXml);
};
_.extend(WpPost.prototype, {
  postFileName: ""
  , commentsFileName: ""
  , comments: []
  , templateData: {}
  , loadCategories: function(postXml)
  {
      var categories = '';
      _.each(postXml.category, function(cat){
        //if(cat.$.domain == 'category') { // Only add categories (tags are also in this list)
          categories += " " + cat._.toLowerCase().replace(/\s/g, '-');
        //}
      });
      this.templateData["categories"] = categories;
  }
  , loadComments: function(postXml)
  {
      this.comments = [];
      _.each(postXml['wp:comment'], function(commentXml){
        // Do not include "pingbacks"
        if(commentXml['wp:comment_type'][0] == 'pingback') {
            return;
        }
        var commentDate = moment(commentXml["wp:comment_date_gmt"][0], parseDateFormat);
        var comment = {
          "comment_id": commentXml["wp:comment_id"][0]
          , "content": commentXml["wp:comment_content"][0].replace(/^\s+|\s+$/g, '')
          , "who": {
              "name": commentXml["wp:comment_author"][0]
              , "url": commentXml["wp:comment_author_url"][0]
          }
          , "when": commentDate.format("D MMM YYYY [at] h:mm a")
          , "ordinal": commentDate.unix()
        };
        this.comments.push(comment);
      }, this);
      this.templateData["includeComments"] = this.comments.length == 0 ? "none" : this.commentsFileName;
  }
  , render: function(template)
  {
      return _.template(template, this.templateData);
  }
  , renderComments: function(template)
  {
      var s = "";
      var orderedComments = _.sortBy(this.comments, function(comment){
        return comment.ordinal;
      });
      _.each(orderedComments, function(comment){
          s += _.template(template, comment);
      });
      return s;
  }
  , writePost: function(outDir, template)
  {
      var outFile = path.join(outDir, this.postFileName);
      var output = this.render(template);
      console.log('>> '+ outFile);
      fs.writeFile(outFile, output, function(err) {
          if(err) {
              console.error(err);
          }
      });
      return this; // for chaining
  }
  , writeComments: function(outDir, template)
  {
      var outFile = path.join(outDir, this.commentsFileName);
      var output = this.renderComments(template);
      console.log('*> '+ outFile);
      fs.writeFile(outFile, output, function(err) {
          if(err) {
              console.error(err);
          }
      });
      return this; // for chaining
  }
});
