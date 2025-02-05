@echo off
call npm init -y
call npm install axios cheerio chalk puppeteer blessed blessed-contrib
call node wordpress-check.js
pause
