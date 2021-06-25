/*
 * This file is part of the esp8266 web interface
 *
 * Copyright (C) 2018 Johannes Huebner <dev@johanneshuebner.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
var chart;
var items = {};
var stop;
var imgid = 0;
var subscription;

/** @brief excutes when page finished loading. Creates tables and chart */
function onLoad()
{
	// Set up listener to execute commands when enter is pressed (dashboard, command box)
	var commandinput = document.getElementById('commandinput');
	commandinput.addEventListener("keyup", function(event)
	{
		if ( event.keyCode == 13 )
		{
            event.preventDefault();
            ui.dashboardCommand();
		}
	});

	updateTables();
	generateChart();
	checkSubscribedParameterSet();
	populateSpotValueDropDown();
	populateExistingCanMappingTable();
	ui.populateWiFiTab();
	// run the poll function every 3 seconds
	var autoRefresh = setInterval(refresh, 10000);
}

/** @brief automatically update data on the UI */
function refresh(){
	inverter.refreshParams();
	updateTables();
	ui.populateVersion();
	ui.refreshStatusBox();
	ui.refreshMessagesBox();
	
}

/** @brief generates chart at bottom of page */
function generateChart()
{
	chart = new Chart("canvas", {
		type: "line",
		options: {
			animation: {
				duration: 0
			},
			scales: {
				yAxes: [{
					type: "linear",
					display: true,
					position: "left",
					id: "left"
				}, {
					type: "linear",
					display: true,
					position: "right",
					id: "right",
					gridLines: { drawOnChartArea: false }
				}]
			}
		} });
}

function parameterSubmit()
{
	document.getElementById("loader0").style.visibility = "visible";
	inverter.getParamList(function(values)
	{
		document.getElementById("loader0").style.visibility = "hidden";
		document.getElementById("parameters_json").value = JSON.stringify(values);
		document.getElementById("paramdb").submit();
	}, true);
}

function checkSubscribedParameterSet()
{
	if (subscription)
	{
		checkToken(subscription.token, 'Checking your parameter subscription ' + subscription.token, false);
	}
}

/* If a valid token is entered, the belonging dataset is downloaded
 * and applied to the inverter. Token and timestamp are saved to ESP filesystem
 * Token example 5f4d8fa6-b6a4-4f87-9a28-4363bdac5dc9 */
function checkToken(token, message, forceUpdate)
{
	var expr = /^[0-9a-f]{8}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i;
	
	if (expr.test(token))
	{
		var xmlhttp=new XMLHttpRequest();
		var req = "https://openinverter.org/parameters/api.php?token=" + token;

		document.getElementById("message").innerHTML = message + "\r\n";
		document.getElementById("parameters_token").value = token;

		xmlhttp.onload = function() 
		{
			var params = JSON.parse(this.responseText);
			var timestamp = params.timestamp;
			
			delete params['timestamp'];			
			document.getElementById("token").value = token;
			
			if (subscription && subscription.timestamp == timestamp && !forceUpdate)
			{
				document.getElementById("message").innerHTML += "Parameters up to date\r\n";
			}
			else if (forceUpdate || confirm("Parameter set updated, apply?"))
			{
				document.getElementById("message").innerHTML += "Applying new parameter set from " + timestamp + "\r\n";

				setParam(params, 0);
				
				var uploadRequest = new XMLHttpRequest();
				var formData = new FormData();
				var subs = "subscription = { 'timestamp': '" + timestamp + "', 'token': '" + token + "' };";
				var blob = new Blob([subs], { type: "text/javascript"});
				formData.append("file", blob, "subscription.js");
				uploadRequest.open("POST", "/edit");
				uploadRequest.send(formData);
			}
		};
		
		xmlhttp.onerror = function()
		{
			alert("error");
		};

		xmlhttp.open("GET", req, true);
		xmlhttp.send();
	}
	else
	{
		var uploadRequest = new XMLHttpRequest();
		var formData = new FormData();
		var subs = "subscription = false;";
		var blob = new Blob([subs], { type: "text/javascript"});
		formData.append("file", blob, "subscription.js");
		uploadRequest.open("POST", "/edit");
		uploadRequest.send(formData);
	}
}

/** @brief generates parameter and spotvalue tables */
function updateTables()
{
	document.getElementById("loader1").style.visibility = "visible";
	document.getElementById("loader2").style.visibility = "visible";

	inverter.getParamList(function(values) 
	{
		var tableParam = document.getElementById("params");
		var tableSpot = document.getElementById("spotValues");
		var lastCategory = "";
		var params = {};

		while (tableParam.rows.length > 1) tableParam.deleteRow(1);
		while (tableSpot.rows.length > 1) tableSpot.deleteRow(1);

		for (var name in values)
		{
			var param = values[name];
			if (param.isparam)
			{
				var valInput;
				var unit = param.unit;
				var index = "-";
				params[name] = param.value;

				if (param.category != lastCategory)
				{
					addRow(tableParam, [ '<BUTTON onclick="toggleVisibility(\'' + 
						param.category + '\');" style="background: none; border: none; font-weight: bold;">- ' + 
						param.category + '</BUTTON>' ]);
					lastCategory = param.category;
				}
				
				if (param.enums)
				{
					if (param.enums[param.value])
					{
					    valInput = '<SELECT onchange="sendCmd(\'set ' + name + ' \' + this.value)">';

					    for (var idx in param.enums)
					    {
     						valInput += '<OPTION value="' + idx + '"';
						    if (idx == param.value)
							    valInput += " selected";
						    valInput += '>' + param.enums[idx] + '</OPTION>';
					    }
					}
					else
					{
 						valInput = "<ul>";
 						for (var key in param.enums)
 						{
 							if (param.value & key)
 								valInput += "<li>" + param.enums[key];
 						}
 						valInput += "</ul>";
					}
					unit = "";
				}
				else
				{
					valInput = '<INPUT type="number" min="' + param.minimum + '" max="' + param.maximum + 
						'" step="0.05" value="' + param.value + '" onchange="sendCmd(\'set ' + name + ' \' + this.value)"/>';
				}
				
				if (param.i !== undefined)
				    index = param.i;
				
				addRow(tableParam, [ index, name, valInput, unit, param.minimum, param.maximum, param.default ]);
			}
			else
			{
				var checkHtml = '<INPUT type="checkbox" data-name="' + name + '" data-axis="left" /> l';
				checkHtml += ' <INPUT type="checkbox" data-name="' + name + '" data-axis="right" /> r';
				var unit = param.unit;

				if (param.enums)
				{
					if (param.enums[param.value])
 					{
 						display = param.enums[param.value];
 					}
 					else
 					{
 						var active = [];
 						for (var key in param.enums)
 						{
 							if (param.value & key)
 								active.push(param.enums[key]);
 						}
 						display = active.join('|');
 					}
					unit = "";
				}
				else
				{
					display = param.value;
				}

				addRow(tableSpot, [ name, display, unit, checkHtml ]);
			}
		}
		document.getElementById("paramDownload").href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(params, null, 2));
		document.getElementById("loader1").style.visibility = "hidden";
		document.getElementById("loader2").style.visibility = "hidden";
	});
}

/** @brief Adds row to a table
 * If table has multiple columns and only one cell value is
 * provided, the cell is spanned across entire table
 * @param table DOM object of table
 * @param content Array of strings with contents for each cell */
function addRow(table, content)
{
	var tr = table.insertRow(-1); //add row to end
	var colSpan = table.rows[0].cells.length - content.length + 1;

	for (var i = 0; i < content.length; i++)
	{
		var cell = tr.insertCell(-1);
		cell.colSpan = colSpan;
		cell.innerHTML = content[i];
	}
}

/** @brief toggles visibility of parameter category
 * @param name name of category to show/hide */
function toggleVisibility(name)
{
	var rows = document.getElementById("params").rows;
	var found = false;
	
	for (var i = 0; i < rows.length; i++)
	{
		if (found)
		{
			if (rows[i].cells.length > 1)
				rows[i].style.display = rows[i].style.display == "" ? "none" : "";
			else
				found = false;
		}

		if (!found)
		{
			found = rows[i].cells.length == 1 && (rows[i].cells[0].innerText.endsWith(name) || !name);
			
			if (found)
			{
				var str = rows[i].cells[0].firstChild.firstChild.nodeValue;
				rows[i].cells[0].firstChild.firstChild.nodeValue = (str.startsWith('-') ? '+' : '-') + str.substring(1);
			}
		}
	}
}

/** @brief Clears inverter reply section */
function clearMessages()
{
	document.getElementById("message").innerHTML = "";
}

/** @brief Maps a spot value to a CAN message
 * @param direction "rx" or "tx"
 * @param name name of spot value to be mapped */
 /*
function canmap(direction, name)
{
    var canid = document.getElementById('canid' + name).value;
    var canpos = document.getElementById('canpos' + name).value;
    var canbits = document.getElementById('canbits' + name).value;
    var cangain = document.getElementById('cangain' + name).value;
    var cmd = "can " + direction + " " + name + " " + canid + " " + canpos + " " + canbits + " " + cangain;
    
    sendCmd(cmd);
}
*/

/** @brief Loads a parameterset from json file and sends each parameter to the inverter */
function loadParametersFromFile()
{
    modal.setModalHeader('large', "Loading parameters");
    modal.emptyModal('large');
    modal.showModal('large');

	var file = document.getElementById('paramfile');
	
	if(file.files.length)
	{
		var reader = new FileReader();

		reader.onload = function(e)
		{
			var params = JSON.parse(e.target.result);
			setParam(params, 0);
		};

		reader.readAsBinaryString(file.files[0]);
	}
}

/** @brief helper function, from a list of parameters send parameter with given index to inverter
 * @param params map of parameters (name -> value)
 * @param index numerical index which parameter to set */
function setParam(params, index)
{
	var keys = Object.keys(params); 
	
	if (index < keys.length)
	{
		var key = keys[index];
		modal.appendToModal('large', "Setting " + key + " to " + params[key] + "<br>");
		inverter.sendCmd("set " + key + " " + params[key], function(reply) {
			modal.appendToModal('large', reply + "<br>");
			// auto-scroll text in modal as it is added
			modal.largeModalScrollToBottom();
			setParam(params, index + 1);
		});
	}
}

/** @brief send arbitrary command to inverter and print result
 * @param cmd command string to be sent */
function sendCmd(cmd)
{
	inverter.sendCmd(cmd, function(reply)
	{
		document.getElementById("message").innerHTML = reply;
	});
}

/** @brief open new page with gauges for selected spot values */
function showGauges()
{
	var items = getPlotItems();
	var req = "gauges.html?items=" + items.names.join(',')

	window.open(req);
}

/** @brief open new page with gauges for selected spot values */
function showLog()
{
	var items = getPlotItems();
	var req = "log.html?items=" + items.names.join(',')

	window.open(req);
}

function fileSelected()
{
}

/** @brief uploads file to web server, if bin-file uploaded, starts a firmware upgrade */
function uploadFile() 
{
	var xmlhttp = new XMLHttpRequest();
	var form = document.getElementById('uploadform');
	
	if (form.getFormData)
		var fd = form.getFormData();
	else
		var fd = new FormData(form);
	var file = document.getElementById('updatefile').files[0].name;

	xmlhttp.onload = function() 
	{
		if (file.endsWith(".bin"))
		{
			runUpdate(-1, "/" + file);
		}
		document.getElementById("bar").innerHTML = "<p>Upload complete</p>";
		setTimeout(function() { document.getElementById("bar").innerHTML = "" }, 5000);
	}

	xmlhttp.open("POST", "/edit");
	xmlhttp.send(fd);
}

/** @brief hard-reset SWD, different from soft-reset*/
function resetSWD()
{		
	var xhr = new XMLHttpRequest();
	xhr.onload = function()
	{
		document.getElementById("swdbar").style.width = "100%";
		document.getElementById("swdbar").innerHTML = "<p>Hard-Reset</p>";
		updateTables();
	};
	xhr.open('GET', '/swd/reset?hard', true);
	xhr.send();
}

/** @brief uploads file to web server, Flash using Serial-Wire-Debug. Start address bootloader = 0x08000000, firmware = 0x08001000*/
function uploadSWDFile() 
{
	var xmlhttp = new XMLHttpRequest();
	var form = document.getElementById('swdform');
	
	if (form.getFormData)
		var fd = form.getFormData();
	else
		var fd = new FormData(form);
	var file = document.getElementById('swdfile').files[0];

	xmlhttp.onload = function()
	{
		var xhr = new XMLHttpRequest();
		xhr.seenBytes = 0;
		xhr.seenTotalPages = 0;
		xhr.onreadystatechange = function() {
		  if(xhr.readyState == 3) {
		    var data = xhr.response.substr(xhr.seenBytes);
		    //console.log(data);

		    if(data.indexOf("Error") != -1) {
		    	document.getElementById("swdbar").style.width = "100%";
				document.getElementById("swdbar").innerHTML = "<p>" + data + "</p>";
		    }else{
			    var s = data.split('\n');
				xhr.seenTotalPages += (s.length - 1) * 16;
				//console.log("pages: " + s.length + " Size: " + ((s.length -1) * 16));

			    var progress = Math.round(100 * xhr.seenTotalPages / file.size);
			    document.getElementById("swdbar").style.width = progress + "%";
			    document.getElementById("swdbar").innerHTML = "<p>" +  progress + "%</p>";
				
			    xhr.seenBytes = xhr.responseText.length;
			}
		  }
		};
		if (file.name.endsWith('loader.bin'))
		{
			xhr.open('GET', '/swd/mem/flash?bootloader&file=' + file.name, true);
		}else{
			xhr.open('GET', '/swd/mem/flash?flash&file=' + file.name, true);
		}
    	xhr.send();
	}
	xmlhttp.open("POST", "/edit");
	xmlhttp.send(fd);
}

/** @brief Runs a step of a firmware upgrade
 * Step -1 is resetting controller
 * Steps i=0..n send page i
 * @param step step to execute
 * @param file file path of upgrade image on server */
function runUpdate(step,file)
{
	var xmlhttp=new XMLHttpRequest();
	xmlhttp.onload = function() 
	{
		step++;
		var result = JSON.parse(this.responseText);
		var totalPages = result.pages;
		var progress = Math.round(100 * step / totalPages);
		document.getElementById("bar").style.width = progress + "%";
		document.getElementById("bar").innerHTML = "<p>" +  progress + "%</p>";
		if (step < totalPages)
			runUpdate(step, file);
		else
			document.getElementById("bar").innerHTML = "<p>Update Done!</p>";
	}
	xmlhttp.open("GET", "/fwupdate?step=" + step + "&file=" + file);
	xmlhttp.send();
}

/** @brief start plotting selected spot values */
function startPlot()
{
	//items = getPlotItems();
	items = ui.getPlotItems();
	console.log(items);
	var colours = [ 'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 159, 64)', 'rgb(153, 102, 255)', 'rgb(255, 205, 86)', 'rgb(75, 192, 192)' ];

	chart.config.data.datasets = new Array();

	for (var signalIdx = 0; signalIdx < items.names.length; signalIdx++)
	{
		var newDataset = {
		        label: items.names[signalIdx],
		        data: [],
		        borderColor: colours[signalIdx % colours.length],
		        backgroundColor: colours[signalIdx % colours.length],
		        fill: false,
		        pointRadius: 0,
		        yAxisID: items.axes[signalIdx]
		    };
		chart.config.data.datasets.push(newDataset);
	}
	
	time = 0;
	chart.update();
	stop = false;
	document.getElementById("pauseButton").disabled = false;
	acquire();
}

/** @brief Stop plotting */
function stopPlot()
{
	stop = true;
	document.getElementById("pauseButton").innerHTML = "Pause Plot";
	document.getElementById("pauseButton").disabled = false;
}

/** @brief pause or resume plotting */
function pauseResumePlot()
{
	if (stop)
	{
		stop = false;
		acquire();
		document.getElementById("pauseButton").innerHTML = "Pause Plot";
	}
	else
	{
		stop = true;
		document.getElementById("pauseButton").innerHTML = "Resume Plot";
	}
}

function acquire()
{
	if (stop) return;
	if (!items.names.length) return;
	var burstLength = document.getElementById('burstLength').value;
	var maxValues = document.getElementById('maxValues').value;
    
    inverter.getValues(items.names, burstLength,
	function(values) 
	{
		for (var i = 0; i < burstLength; i++)
		{
			chart.config.data.labels.push(time);
			time++;
		}
		chart.config.data.labels.splice(0, Math.max(chart.config.data.labels.length - maxValues, 0));

		for (var name in values)
		{
			var data = chart.config.data.datasets.find(function(element) { return element.label == name }).data;
			
			for (var i = 0; i < values[name].length; i++)
			{
				data.push(values[name][i])
				data.splice(0, Math.max(data.length - maxValues, 0));
			}
		}

		chart.update();
		acquire();
	});
}

/*
function getPlotItems()
{
	var items = {};
	items.names = new Array();
	items.axes = new Array();

	var matches = document.querySelectorAll("#spotValues input[type=checkbox]");

	for (var i = 0; i < matches.length; i++)
	{
		if (matches[i].checked)
		{
			items.names.push(matches[i].dataset.name);
			items.axes.push(matches[i].dataset.axis);
		}
	}
	return items;
}
*/

/** @brief switch to a different page tab */
function openPage(pageName, elmnt, color) {
	// hide all tabs
    var i, tabdiv, tablinks;
    tabdiv = document.getElementsByClassName("tabdiv");
    for (i = 0; i < tabdiv.length; i++) {
        tabdiv[i].style.display = "none";
    }

    // un-highlight all tabs
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].style.backgroundColor = "";
    }

    // show selected tab
    document.getElementById(pageName).style.display = "flex";
    elmnt.style.backgroundColor = color;
}

// Get the element with id="defaultOpen" and click on it
//document.getElementById("dashboard-link").click();

/** @brief Populate the 'spot value' drop-down on the 'Add new CAN mapping' form */
function populateSpotValueDropDown(){
	var select = document.getElementById("addCanMappingSpotValueDropDown");
	inverter.getParamList(function(values) {
		for (var name in values) {
			var param = values[name];
			if (!param.isparam) {
				var el = document.createElement("option");
				el.textContent = name;
				el.value = name;
				select.appendChild(el);
			}
		}
	});
}

/** @brief Populate the table of existing CAN mappings */
function populateExistingCanMappingTable() {
	var existigCanMappingTable = document.getElementById("existingCanMappingTable");
	// emtpy the table
	while (existigCanMappingTable.rows.length > 1) existigCanMappingTable.deleteRow(1);
	inverter.getParamList(function(values) {
		for (var name in values) {
			var param = values[name];
			if (typeof param.canid !== 'undefined'){
				var tr = existigCanMappingTable.insertRow(-1);
				// name of spot value
				var canNameCell = tr.insertCell(-1);
				canNameCell.innerHTML = name;
				// tx/rx
				var canTxRxCell = tr.insertCell(-1);
				canTxRxCell.innerHTML = param.isrx ? "Receive" : "Transmit";;
				// canid
				var canIdCell = tr.insertCell(-1);
	        	canIdCell.innerHTML = param.canid;
	        	// canoffset
				var canOffsetCell = tr.insertCell(-1);
	        	canOffsetCell.innerHTML = param.canoffset;
	        	// canlength
				var canLengthCell = tr.insertCell(-1);
	        	canLengthCell.innerHTML = param.canlength;
	        	// cangain
				var canGainCell = tr.insertCell(-1);
	        	canGainCell.innerHTML = param.cangain;
	        	// delete button
				var canDeleteCell = tr.insertCell(-1);
				var cmd = "inverter.canMapping('del', '" + name + "');populateExistingCanMappingTable();";
	        	canDeleteCell.innerHTML = "<button onclick=\"" + cmd + "\"><img class=\"buttonimg\" src=\"/icon-trash.png\">Delete mapping</button>";
			}
		}
	});
}





var ui = {

    // The API endpoint to query to get firmware release available in Github
	githubFirmwareReleaseURL: 'https://api.github.com/repos/jsphuebner/stm32-sine/releases',

	/** @brief fill out version */
	populateVersion: function() 
	{
		var versionDiv = document.getElementById("version");
		versionDiv.innerHTML = "";
		var firmwareVersion = String(paramsCache.get('version'));
		//console.log(firmwareVersion);
		versionDiv.innerHTML += "firmware : " + firmwareVersion + "<br>";
		versionDiv.innerHTML += "web : v1.99"
	},

	/** @brief Add a CAN Mapping */
	canMapping: function()
	{
		// fetch values from form
		var direction = document.getElementById('txrx').value;
		var name = document.getElementById('addCanMappingSpotValueDropDown').value;
		var canid = document.getElementById('canid').value;
	    var canpos = document.getElementById('canpos').value;
	    var canbits = document.getElementById('canbits').value;
	    var cangain = document.getElementById('cangain').value;
	    // send new CAN mapping to inverter
	    inverter.canMapping(direction, name, canid, canpos, canbits, cangain);
	    // hide form
	    modal.hideModal('can-mapping');
	    // refresh CAN mapping table
	    populateExistingCanMappingTable();
	},

	refreshStatusBox: function()
	{

		var statusDiv = document.getElementById('top-left');

		var status = paramsCache.get('status');
		//console.log("status : " + status);

		if ( status == null ){
			return;
		}

		var lasterr = paramsCache.get('lasterr');
		var udc = paramsCache.get('udc');
		var tmphs = paramsCache.get('tmphs');
		var opmode = paramsCache.get('opmode');

		statusDiv.innerHTML = "";

		var tbl = document.createElement('table');
		var tbody = document.createElement('tbody');
		// status
		var tr = document.createElement('tr');
		var td = document.createElement('td');
		td.appendChild(document.createTextNode('Status'));
		tr.appendChild(td);
		td = document.createElement('td');
		td.appendChild(document.createTextNode(status));
		tr.appendChild(td);
		tbody.appendChild(tr);
		// opmode
		tr = document.createElement('tr');
	    td = document.createElement('td');
		td.appendChild(document.createTextNode('Opmode'));
		tr.appendChild(td);
		td = document.createElement('td');
		td.appendChild(document.createTextNode(opmode));
		tr.appendChild(td);
		tbody.appendChild(tr);
		// lasterr
		tr = document.createElement('tr');
		td = document.createElement('td');
		td.appendChild(document.createTextNode('Last error'));
		tr.appendChild(td);
		td = document.createElement('td');
		td.appendChild(document.createTextNode(lasterr));
		tr.appendChild(td);
		tbody.appendChild(tr);
		// udc
		tr = document.createElement('tr');
		td = document.createElement('td');
		td.appendChild(document.createTextNode('Battery voltage (udc)'));
		tr.appendChild(td);
		td = document.createElement('td');
		td.appendChild(document.createTextNode(udc));
		tr.appendChild(td);
		tbody.appendChild(tr);
		// tmphs
		tr = document.createElement('tr');
		td = document.createElement('td');
		td.appendChild(document.createTextNode('Inverter temperature'));
		tr.appendChild(td);
		td = document.createElement('td');
		td.appendChild(document.createTextNode(tmphs));
		tr.appendChild(td);
		tbody.appendChild(tr);


		tbl.appendChild(tbody);
		statusDiv.appendChild(tbl);

    },

    /** @brief execute command entered in the command box on the dashboard */
    dashboardCommand: function()
    {
    	// Get command entered
    	var commandinput = document.getElementById('commandinput').value;
    	console.log("running dash command" + commandinput);
    	// Get output box
    	var commandoutput = document.getElementById('commandoutput');
    	inverter.sendCmd(commandinput, function(reply){
            commandoutput.innerHTML += reply + "<br>";
            // Scroll output if needed
    	    commandoutput.scrollTop = commandoutput.scrollHeight;
    	});
    },

    /** @brief get error messages from inverter and put them in the messages box on the dash */
    refreshMessagesBox: function(){
    	var messageBox = document.getElementById('message');
    	inverter.sendCmd('errors', function(reply){
            messageBox.innerHTML = reply;
    	});
    },


    /** Firmware update from file */

    showUpdateFirmwareModal: function()
    {
    	modal.emptyModal('large');
    	modal.setModalHeader('large', "Update firmware from file");
    	var form = `
   	      <form id="update-form">
    	    <a onclick="ui.installFirmwareUpdate();"><button>
    	        <img class="buttonimg" src="/icon-check-circle.png">Install firmware</button></a>
    	  </form> 
    	  <div id="progress" class="graph" style="display:none;">
		    <div id="bar" style="width: 0"></div>
		  </div>
    	`;
    	modal.appendToModal('large', form);
    	modal.showModal('large');
    },

    /** Over-the-air updates */

    /** @brief fetch a list of firmware release available from Github */
    populateReleasesDropdown: function(selectId)
    {
    	var releases = undefined;
    	var getReleasesRequest = new XMLHttpRequest();
    	var select = document.getElementById(selectId);

    	getReleasesRequest.onload = function()
    	{
    		var releases = JSON.parse(this.responseText);

    		for ( let r = 0; r < releases.length; r++ )
    		{
    			// each release can have multiple assets (sine vs foc), step through them
    			for ( let a = 0; a < releases[r].assets.length; a++ )
    			{
    				if ( releases[r].assets[a].name.endsWith('.bin') )
    				{
    					var rName = releases[r].tag_name + " : " + releases[r].assets[a].name;
    					var rUrl = releases[r].assets[a].browser_download_url;
        				var selection = "<option value=\"" + rUrl + "\">" + rName + "</option>";
        				select.innerHTML += selection;
    				}
    				
    			}
    		}
    	};

    	getReleasesRequest.onerror = function()
		{
			alert("error");
		};

		getReleasesRequest.open("GET", ui.githubFirmwareReleaseURL, true);
		getReleasesRequest.send();
    },
    
    /** @brief bring up the modal for installing a new firmware over-the-air */
    showOTAUpdateFirmwareModal: function() {
    	// empty the modal in case there's still something in there
    	modal.emptyModal('large');

    	// Insert the form
    	var form = `
    	  <form id="ota-update-form">
    	    <h2>Over the air firmware update</h2>
    	    <p>Choose a release to install</p>
    	    <select id="ota-release"></select>
    	    <a onclick="ui.installOTAFirmwareUpdate();"><button>
    	        <img class="buttonimg" src="/icon-check-circle.png">Install firmware</button></a>
    	  </form> 
          <div id="ota-release-selected-div" style="display:hidden;"></div>
    	  <div id="progress" class="graph" style="display:hidden;">
		    <div id="bar" style="width: 0"></div>
		  </div>
    	`;
    	modal.appendToModal('large', form);

    	// get list of available releases
    	ui.populateReleasesDropdown('ota-release');

        modal.showModal('large');
    },

    /** @brief install over-the-air update */
    installOTAFirmwareUpdate: function()
    {
    	console.log("installOTAFirmwareUpdate start");
    	// get release selected
    	var releaseURL = document.getElementById('ota-release').value;

    	// hide the form
    	var otaUpdateForm = document.getElementById('ota-update-form').display = 'none';

    	// Display what version we're installing
    	var otaReleaseSelectedDiv = document.getElementById('ota-release-selected-div');
    	otaReleaseSelectedDiv.innerHTML += "<p>Installing firmware from " + releaseURL;

    	// fetch the release
    	var releaseRequest = new XMLHttpRequest();
    	releaseRequest.responseType = "blob";
    	releaseRequest.onload = function()
    	{
    		console.log("here");
    		var releaseBlob = releaseRequest.response;
    		console.log(releaseBlob);
    		// build form we will submit to /edit to upload the file blob
    		var editFormData = new FormData();
    		editFormData.append("updatefile", releaseBlob, "stm32.bin");
    		var uploadRequest = new XMLHttpRequest();
    		uploadRequest.onload = function(response)
    		{
    			console.log(response);
    		}
    		uploadRequest.open("POST", "/edit");
    		uploadRequest.send(editFormData);
    	}
    	releaseRequest.open("GET", releaseURL);
    	releaseRequest.send();
    },

    /** @brief uploads file to web server, if bin-file uploaded, starts a firmware upgrade */
    doOTAUpdate: function() 
	{
		var xmlhttp = new XMLHttpRequest();
		var form = document.getElementById('uploadform');
		
		if (form.getFormData)
			var fd = form.getFormData();
		else
			var fd = new FormData(form);
		var file = document.getElementById('updatefile').files[0].name;

		xmlhttp.onload = function() 
		{
			if (file.endsWith(".bin"))
			{
				runUpdate(-1, "/" + file);
			}
			document.getElementById("bar").innerHTML = "<p>Upload complete</p>";
			setTimeout(function() { document.getElementById("bar").innerHTML = "" }, 5000);
		}

		xmlhttp.open("POST", "/edit");
		xmlhttp.send(fd);
	},

	/** WiFi */

	wifiValidatePasswordLength: function(pw)
	{
		document.getElementById("apsubmit").disabled = pw.length < 8;
	},

	populateWiFiTab: function()
	{
		console.log("updating wifi");
		var wifiTab = document.getElementById("wifi");
		var wifiFetchRequest = new XMLHttpRequest();
		wifiFetchRequest.onload = function()
		{
			wifiTab.innerHTML = this.responseText;
		}
		wifiFetchRequest.open("GET", "/wifi");
		wifiFetchRequest.send();
	},

	submitWiFiChange: function()
	{
		// get the form values
		var apSSID = document.getElementById("apSSID").value;
		var apPW = document.getElementById("apPW").value;
		var staSSID = document.getElementById("staSSID").value;
		var staPW = document.getElementById("staPW").value;
		// submit the changes
		var wifiTab = document.getElementById("wifi");
		var wifiUpdateRequest = new XMLHttpRequest();
		wifiUpdateRequest.onload = function()
		{
			wifiTab.innerHTML = this.responseText;
		}
		wifiUpdateRequest.open("POST", "/wifi")
		wifiUpdateRequest.send()
	},

	/** Plot */

    /** @brief Add new field chooser to plot configuration form */
	addPlotItem: function()
	{
		// Get the form
		var plotFields = document.getElementById("plotConfiguration");

		// container for the two drop downs
		var selectDiv = document.createElement("div");
		selectDiv.classList.add('plotField');
		plotFields.appendChild(selectDiv);

		// Create a drop down and populate it with the possible spot values
		var selectSpotValue = document.createElement("select");
		selectSpotValue.classList.add('plotFieldSelect');
		for ( var key in paramsCache.data )
		{
			if ( ! paramsCache.data[key].isparam )
			{
				var option = document.createElement("option");
				option.value = key;
				option.text = key;
				selectSpotValue.appendChild(option);
			}
		}
		selectDiv.appendChild(selectSpotValue);

		// Create the left/right drop down
		var selectLeftRight = document.createElement("select");
		selectLeftRight.classList.add("leftright");

		var optionLeft = document.createElement("option");
		optionLeft.value = 'left';
		optionLeft.text = 'left';
		selectLeftRight.appendChild(optionLeft);

		var optionRight = document.createElement("option");
		optionRight.value = 'right';
		optionRight.text = 'right';
		selectLeftRight.appendChild(optionRight);
		selectDiv.appendChild(selectLeftRight);

		// Add the delete button
		var deleteButton = document.createElement("button");
		var deleteButtonImg = document.createElement('img');
		deleteButtonImg.src = '/icon-trash.png';
		deleteButton.appendChild(deleteButtonImg);
		deleteButton.onclick = function() { this.parentNode.remove(); };
		selectDiv.appendChild(deleteButton);
	},

	getPlotItems: function()
	{
		var items = {};
    	items.names = new Array();
	    items.axes = new Array();
		var plotItemsForm = document.getElementById("plotConfiguration");
		var formItems = document.forms["plotConfiguration"].elements;
		//for ( var i=0; i < formItems.length; i++ ) { console.log(formItems[i]); }
		for ( var i = 0; i < formItems.length; i++ )
		{

            // Gather up field selections			
			if ( formItems[i].type === 'select-one' && formItems[i].classList.contains('plotFieldSelect') )
			{
				items.names.push(formItems[i].value);
			}

			// Gather up left/right selections
			if ( formItems[i].type === 'select-one' && formItems[i].classList.contains('leftright') )
			{
				items.axes.push(formItems[i].value);
			}

		}
        return items;
	}

}


