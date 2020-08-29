#!/usr/bin/python3

# This script automates JS/CSS code minification and optimization
# and also create minified versions of the HTML files that use
# the minified scripts and CSS

# TODO:
# [ ] Frontend
# 	[ ] Parse all xxx.html and search for <script> and <link>
# 	[ ] For all .html do:
# 		[ ] Concatenate all included scripts in order
# 		[ ] Uglify the result to xxx.min.js
# 		[ ] Uglify all yyy.css to yyy.min.css
# 		[ ] Export a xxx.html that includes xxx.min.js and all yyy.min.css instead of original files
# [ ] Backend
# 	[ ] Minify all .js but keep them separate


import sys, os, argparse


def main(argv):
	pass


if __name__ == '__main__':
    main(sys.argv[1:])