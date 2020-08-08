#!/usr/bin/env node

const
	{ program } = require('commander'),
	fetch = require('node-fetch'),
	crypto = require('crypto'),
	fs = require('fs'),
	path = require('path'),
	readline = require("readline"),
	httpAgent = new require('http').Agent({keepAlive: true});

program
	.option('-p, -profilePath <directory>', "Install to specified directory", process.cwd() + "/Blockland")
	.option('-m, -manifest <file>',"Use manifest file instead")
	.option('-v, -verbose',"List out of date files", false)
	.option('-i, -ignore',"Don't ask to confirm updates", false)
	.option('-c, -check',"Don't update, just check", false)
	.parse(process.argv);
	
const Launcher = {
	"files": [],
	"update": [],
	"download": "",
	"grabbed": false,

	"downloadManifest": async function () {
		if(program.Manifest !== undefined) {
			if(!fs.existsSync(path.normalize(program.Manifest))) {
				console.error(`ERROR: Manifest file ${program.Manifest} does not exist.`);
				return;
			}
			console.log(`Reading manifest file ${program.Manifest}...`);
			return fs.readFileSync(path.normalize(program.Manifest));
		} else {
			console.log("Retrieving latest version listings...");
			return await fetch("http://update.blockland.us/latestVersion.php",
					{ headers: { 'User-Agent': 'blocklandWIN/2.0' } })
				.then(res => res.buffer())
				.catch(e => {console.error(e.toString()); return; });
		}
	},
	"grabFileList": async function() {
		await Launcher.downloadManifest().then(buffer => {
			if(buffer == undefined)
				return;
			var buf = buffer.toString().split("\n");

			Launcher.download = buf[0].split("\t")[1];
			Launcher.files = buf.slice(1);
			Launcher.grabbed = true;
		});
	},
	"generateUpdateList": async function() {
		console.log("Generating list of files to update...")
		if(!Launcher.grabbed)
			await Launcher.grabFileList();
		
		for(i in Launcher.files) {
			l = Launcher.files[i].split('\t');

			if(l.length !== 2)
				continue;

			file = {
				"name": l[0],
				"sha1": l[1]
			};

			abspath = path.normalize(program.ProfilePath + file.name);

			if(fs.existsSync(abspath)) {
				var buffer = fs.readFileSync(abspath);
				var sha1 = crypto.createHash('sha1').update(buffer).digest("hex");
				if(sha1 !== file.sha1) {
					if(program.Verbose)
						console.warn(`File ${file.name} expects hash ${file.sha1}`);
					Launcher.update.push(file);
				}
			} else {
				if(program.Verbose)
					console.warn(`File ${file.name} is missing`);
				Launcher.update.push(file);
			}
		}
	},
	"grabFiles": async function() {
		var total = Launcher.update.length;
		if(total == 0)
			return;

		console.log(`Downloading ${total} files...`);

		var successfulFiles = 0;
		for(i in Launcher.update) {
			l = Launcher.update[i];
			j = parseInt(i)+1;

			percent = (j / total * 100).toFixed(2) + "%";
			process.stdout.write(("[" + j + "/" + total + "]").padEnd(13) + l.name.padEnd(process.stdout.columns - 22) + percent.padStart(8) + "\r")

			filepath = path.normalize(program.ProfilePath + l.name);
			if(!fs.existsSync(path.dirname(filepath)))
				fs.mkdirSync(path.dirname(filepath), { recursive: true });

			await fetch(Launcher.download + "/" + l.sha1, {
				headers: { 'User-Agent': "" },
				agent: httpAgent
			})
			.then(res => res.buffer())
			.then(buffer => {
				var sha1 = crypto.createHash('sha1').update(buffer).digest("hex");
				if(sha1 !== l.sha1) {
					console.warn(`\x1b[0KWARNING: File ${l.name} has wrong hash, expected ${l.sha1}, got ${sha1}`)
				} else {
					fs.writeFileSync(filepath, buffer)
					successfulFiles += 1;
				}
			})
		}
		
		console.log(`\x1b[0KUpdated ${successfulFiles} files.`)
	}
}

function launcherPrompt() {
	updates = Launcher.update.length;
		
	if(Launcher.download == "")
		return; // don't show prompt if the download url is empty

	if(program.Check) {
		if(updates > 0) {
			console.log(`\nUpdates are available for installation at ${program.ProfilePath}`);
			console.log(`${updates} files are out of date or missing`);
		}
		else {
			console.log(`\nThe installation at ${program.ProfilePath} is up to date.`)
		}
	} else {
		if(updates > 0) {
			if(!program.Ignore) {
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout
				});
				rl.question("\nAre you sure you want to update " + updates + " files? (y/n)\t", r => {
					if(r.toLowerCase() == "y" || r.toLowerCase() == "yes")
						Launcher.grabFiles();
					rl.close();
				});
			} else 
				Launcher.grabFiles();
		} else {
			console.log("\nAll files are already up to date.")
		}
	}
}

Launcher.generateUpdateList().then(() => launcherPrompt());
