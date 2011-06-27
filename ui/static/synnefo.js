//
// Copyright 2011 GRNET S.A. All rights reserved.
//
// Redistribution and use in source and binary forms, with or
// without modification, are permitted provided that the following
// conditions are met:
//
//   1. Redistributions of source code must retain the above
//      copyright notice, this list of conditions and the following
//      disclaimer.
//
//   2. Redistributions in binary form must reproduce the above
//      copyright notice, this list of conditions and the following
//      disclaimer in the documentation and/or other materials
//      provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY GRNET S.A. ``AS IS'' AND ANY EXPRESS
// OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
// PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GRNET S.A OR
// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF
// USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
// AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
// ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
//
// The views and conclusions contained in the software and
// documentation are those of the authors and should not be
// interpreted as representing official policies, either expressed
// or implied, of GRNET S.A.
//
var API_URL = "/api/v1.1";
var changes_since = 0, deferred = 0, update_request = false, load_request = false, pending_actions = [];
var flavors = [], images = [], servers = [], disks = [], cpus = [], ram = [];
var networks = [], networks_changes_since = 0;


//FIXME: authentication
//if cookie with value X-Auth-Token exists, set the value on the headers.
    $.ajaxSetup({
        'beforeSend': function(xhr) {
            //if ($.cookie("X-Auth-Token") != null) {
              xhr.setRequestHeader("X-Auth-Token", $.cookie("X-Auth-Token"));
            //} else {
            //    $.cookie("X-Auth-Token", "46e427d657b20defe352804f0eb6f8a2"); // set X-Auth-Token cookie
            //}
        }
    });

function ISODateString(d){
    //return a date in an ISO 8601 format using UTC.
    //do not include time zone info (Z) at the end
    //taken from the Mozilla Developer Center
    function pad(n){ return n<10 ? '0'+n : n }
    return  d.getUTCFullYear()+ '-' +
            pad(d.getUTCMonth()+1) + '-' +
            pad(d.getUTCDate()) + 'T' +
            pad(d.getUTCHours()) + ':' +
            pad(d.getUTCMinutes()) + ':' +
            pad(d.getUTCSeconds()) +'Z'
}

function parse_error(responseText, errorCode){
    var errors = [];
    try {
        responseObj = JSON.parse(responseText);
    }
    catch(err) {
        errors[0] = {'code': errorCode};
        return errors;
    }
    for (var err in responseObj){
        errors[errors.length] = responseObj[err];
    }
    return errors;
}

// indexOf prototype for IE
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(elt /*, from*/) {
    var len = this.length;
    var from = Number(arguments[1]) || 0;
    from = (from < 0)
         ? Math.ceil(from)
         : Math.floor(from);
    if (from < 0)
      from += len;

    for (; from < len; from++) {
      if (from in this &&
          this[from] === elt)
        return from;
    }
    return -1;
  };
}

// trim prototype for IE
if(typeof String.prototype.trim !== 'function') {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, ''); 
    }
}

function update_confirmations() {
    // hide all confirm boxes to begin with
    $('#machines-pane div.confirm_single').hide();
    $('#machines-pane div.confirm_multiple').hide();
    var action_type = [];
    // standard view or single view
    if ($.cookie("view") == '0' || $.cookie("view") == '2') {
        for (var i=0; i<pending_actions.length; i++) {
            // show single confirms
            if (pending_actions[i][0] == reboot) {
                action_type = "reboot";
            } else if (pending_actions[i][0] == shutdown) {
                action_type = "shutdown";
            } else if (pending_actions[i][0] == start) {
                action_type = "start";
            } else if (pending_actions[i][0] == open_console) {
                action_type = "console";
            } else {
                action_type = "destroy";
            }
            $("#machines-pane #" + pending_actions[i][1] +
            " div.action-container." + action_type + " div.confirm_single").show();
        }
    }
    // if more than one pending action show multiple confirm box
    if (pending_actions.length>1 || $.cookie("view") == '1' && pending_actions.length == 1){
        $('#machines-pane div.confirm_multiple span.actionLen').text(pending_actions.length);
        $('#machines-pane div.confirm_multiple').show();
    }
}

function update_network_confirmations(){
    // hide all confirm boxes to begin with
    $('#networks-pane div.confirm_multiple').hide();

    for (var i=0;i<pending_actions.length;i++){
        // show single confirms depending on the action
        if (pending_actions[i][0] == delete_network) {
            $("#networks-pane div.network#net-"+pending_actions[i][1]).children('.confirm_single').show();
        } else if (pending_actions[i][0] == remove_server_from_network) {
            $("#networks-pane div.network #net-"+pending_actions[i][1]+"-server-"+pending_actions[i][2]).children('.confirm_single').show();
        } // else {}
    }

    // if more than one pending action show multiple confirm box
    if (pending_actions.length > 1){
        $('#networks-pane div.confirm_multiple span.actionLen').text(pending_actions.length);
        $('#networks-pane div.confirm_multiple').show();
    }
}

function list_view() {
    changes_since = 0; // to reload full list
    pending_actions = []; // clear pending actions
    update_confirmations();
    clearTimeout(deferred);    // clear old deferred calls
    try {
        update_request.abort(); // cancel pending ajax updates
        load_request.abort();
    }catch(err){}
    $.cookie("view", '1'); // set list cookie
    uri = $("a#list").attr("href");
    load_request = $.ajax({
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "html",
        error: function(jqXHR, textStatus, errorThrown) {
            return false;
        },
        success: function(data, textStatus, jqXHR) {
            $("a#list")[0].className += ' activelink';
            $("a#standard")[0].className = '';
            $("a#single")[0].className = '';
            $("div#machinesview").html(data);
        }
    });
    return false;
}

function single_view() {
    changes_since = 0; // to reload full list
    pending_actions = []; // clear pending actions
    update_confirmations();
    clearTimeout(deferred);    // clear old deferred calls
    try {
        update_request.abort(); // cancel pending ajax updates
        load_request.abort();
    }catch(err){}
    $.cookie("view", '2'); // set list cookie
    uri = $("a#single").attr("href");
    load_request = $.ajax({
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "html",
        error: function(jqXHR, textStatus, errorThrown) {
            return false;
        },
        success: function(data, textStatus, jqXHR) {
            $("a#single")[0].className += ' activelink';
            $("a#standard")[0].className = '';
            $("a#list")[0].className = '';
            $("div#machinesview").html(data);
        }
    });
    return false;
}

function standard_view() {
    changes_since = 0; // to reload full list
    pending_actions = []; // clear pending actions
    update_confirmations();
    clearTimeout(deferred);    // clear old deferred calls
    try {
        update_request.abort() // cancel pending ajax updates
        load_request.abort();
    }catch(err){}
    $.cookie("view", '0');
    uri = $("a#standard").attr("href");
    load_request = $.ajax({
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "html",
        error: function(jqXHR, textStatus, errorThrown) {
            return false;
        },
        success: function(data, textStatus, jqXHR) {
            $("a#standard")[0].className += ' activelink';
            $("a#list")[0].className = '';
            $("a#single")[0].className = '';
            $("div#machinesview").html(data);
        }
    });
    return false;
}

function choose_view() {
    if ($.cookie("view")=='1') {
        list_view();
    } else if ($.cookie("view")=='2'){
        single_view();
    } else {
        standard_view();
    }
}

// return value from metadata key "OS", if it exists
function os_icon(metadata) {
    if (!metadata) {
        return 'unknown';
    }
    if (metadata.values.OS == undefined || metadata.values.OS == '') {
        return 'unknown';
    } else {
        if (os_icons.indexOf(metadata.values.OS) == -1) {
            return 'unknown';
        } else {
            return metadata.values.OS;
        }
    }
}

function os_icon_from_value(metadata) {
    if (!metadata) {
        return 'unknown';
    }
if (metadata == undefined || metadata == '') {
        return 'unknown';
    } else {
        if (os_icons.indexOf(metadata) == -1) {
            return 'unknown';
        } else {
            return metadata;
        }
    }
}

// get and show a list of running and terminated machines
function update_vms(interval) {
    try{ console.info('updating machines'); } catch(err){}
    var uri= API_URL + '/servers/detail';

    if (changes_since != 0)
        uri+='?changes-since='+changes_since

    update_request = $.ajax({
        cache: false,
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "json",
        error: function(jqXHR, textStatus, errorThrown) {
            // don't forget to try again later
            if (interval) {
                clearTimeout(deferred);    // clear old deferred calls
                deferred = setTimeout(function() {update_vms(interval);},interval,interval);
            }
            // as for now, just show an error message
            try { console.info('update_vms errback:' + jqXHR.status ) } catch(err) {}
            try {
                ajax_error(jqXHR.status, undefined, 'Update VMs', jqXHR.responseText);
            } catch(err) {
                ajax_error(err);
            }
            return false;
            },
        success: function(data, textStatus, jqXHR) {
            // create changes_since string if necessary
            if (jqXHR.getResponseHeader('Date') != null){
                changes_since_date = new Date(jqXHR.getResponseHeader('Date'));
                changes_since = ISODateString(changes_since_date);
            }

            if (interval) {
                clearTimeout(deferred);    // clear old deferred calls
                deferred = setTimeout(function() {update_vms(interval);},interval,interval);
            }

            if (jqXHR.status == 200 || jqXHR.status == 203) {
                try {
                    servers = data.servers.values;
                    jQuery.parseJSON(data);
                    update_machines_view(data);
                } catch(err) { ajax_error('400', undefined, 'Update VMs', jqXHR.responseText);}
            } else if (jqXHR.status != 304){
                try { console.info('update_vms callback:' + jqXHR.status ) } catch(err) {}
                /*
                FIXME:  Here it should return the error, however Opera does not support 304.
                        Instead 304 it returns 0. To dealt with this we treat 0 as an
                        304, which should be corrected (Bug #317).
                */
                //ajax_error(jqXHR.status, undefined, 'Update VMs', jqXHR.responseText);
            }
            return false;
        }
    });
    return false;
}

// get a list of running and terminated machines, used in network view
function update_networks(interval) {
    try{ console.info('updating networks'); } catch(err){}
    var uri= API_URL + '/servers/detail';

    if (changes_since != 0)
        uri+='?changes-since='+changes_since

    update_request = $.ajax({
        cache: false,
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "json",
        error: function(jqXHR, textStatus, errorThrown) {
            // don't forget to try again later
            if (interval) {
                clearTimeout(deferred);    // clear old deferred calls
                deferred = setTimeout(function() {update_networks(interval);},interval,interval);
            }
            // as for now, just show an error message
            try { console.info('update_networks errback:' + jqXHR.status ) } catch(err) {}
            try {
                ajax_error(jqXHR.status, undefined, 'Update networks', jqXHR.responseText);
            } catch(err) {
                ajax_error(err);
            }
            return false;
            },
        success: function(data, textStatus, jqXHR) {
            // create changes_since string if necessary
            if (jqXHR.getResponseHeader('Date') != null){
                changes_since_date = new Date(jqXHR.getResponseHeader('Date'));
                changes_since = ISODateString(changes_since_date);
            }

            if (interval) {
                clearTimeout(deferred);    // clear old deferred calls
                deferred = setTimeout(function() {update_networks(interval);},interval,interval);
            }

            if (jqXHR.status == 200 || jqXHR.status == 203) {
                try {
                    servers = data.servers.values;
                    jQuery.parseJSON(data);
                    update_network_names(data);
                } catch(err) { ajax_error('400', undefined, 'Update networks', jqXHR.responseText);}
            } else if (jqXHR.status == 304) {
                update_network_names();
            }
            else {
                try { console.info('update_networks callback:' + jqXHR.status ) } catch(err) {}
                /*
                FIXME:  Here it should return the error, however Opera does not support 304.
                        Instead 304 it returns 0. To dealt with this we treat 0 as an
                        304, which should be corrected (Bug #317).
                */
                //ajax_error(jqXHR.status, undefined, 'Update networks', jqXHR.responseText);
                update_network_names();
            }
            return false;
        }
    });
    return false;
}

// get and show a list of public and private networks
function update_network_names(servers_data) {
    try{ console.info('updating network names'); } catch(err){}
    var uri= API_URL + '/networks/detail';

    if (networks_changes_since != 0)
        //FIXME: Comment out the following, until metadata do not 304 when changed
        uri+='?changes-since=' + networks_changes_since

    update_request = $.ajax({
        cache: false,
        url: uri,
        type: "GET",
        timeout: TIMEOUT,
        dataType: "json",
        error: function(jqXHR, textStatus, errorThrown) {
            // as for now, just show an error message
            try {
                console.info('update_network names errback:' + jqXHR.status )
            } catch(err) {}
            try {
                ajax_error(jqXHR.status, undefined, 'Update network names', jqXHR.responseText);
            } catch(err) {
                ajax_error(err);
            }
            return false;
            },
        success: function(data, textStatus, jqXHR) {
            // create changes_since string if necessary
            if (jqXHR.getResponseHeader('Date') != null){
                changes_since_date = new Date(jqXHR.getResponseHeader('Date'));
                networks_changes_since = ISODateString(changes_since_date);
            }

            if (jqXHR.status == 200 || jqXHR.status == 203) {
                try {
                    networks = data.networks.values;
                    jQuery.parseJSON(data);
                    update_networks_view(servers_data, data);
                } catch(err) {
                    ajax_error('400', undefined, 'Update network names', jqXHR.responseText);
                }
            } else if (jqXHR.status == 304) {
                update_networks_view(servers_data);
            } else if (jqXHR.status != 304){
                try { console.info('update_network_names callback:' + jqXHR.status ) } catch(err) {}
                /*
                FIXME:  Here it should return the error, however Opera does not support 304.
                        Instead 304 it returns 0. To dealt with this we treat 0 as an
                        304, which should be corrected (Bug #317).
                */
                //ajax_error(jqXHR.status, undefined, 'Update network names', jqXHR.responseText);
                update_networks_view(servers_data);
            }
            return false;
        }
    });
    return false;
}

// get and show a list of available standard and custom images
function update_images() {
    $.ajax({
        url: API_URL + '/images/detail',
        type: "GET",
        //async: false,
        dataType: "json",
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        ajax_error(jqXHR.status, undefined, 'Update Images', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
            try {
                images = data.images.values;
                jQuery.parseJSON(data);
                update_wizard_images();
            } catch(err){
                ajax_error("NO_IMAGES");
            }
        }
    });
    return false;
}

function update_wizard_images() {
    if ($("ul#standard-images li").toArray().length + $("ul#custom-images li").toArray().length == 0) {
        $.each(images, function(i,image){
            var img = $('#image-template').clone().attr("id","img-"+image.id).fadeIn("slow");
            img.find("label").attr('for',"img-radio-" + image.id);
            img.find(".image-title").text(image.name);
            if (image.metadata) {
                if (image.metadata.values.description != undefined) {
                    img.find(".description").text(image.metadata.values.description);
                }
                if (image.metadata.values.size != undefined) {
                    img.find("#size").text(image.metadata.values.size);
                }
            }
            img.find("input.radio").attr('id',"img-radio-" + image.id);
            if (i==0) img.find("input.radio").attr("checked","checked");
            var image_logo = os_icon(image.metadata);
            img.find("img.image-logo").attr('src','static/icons/os/'+image_logo+'.png');
            if (image.metadata) {
                if (image.metadata.values.serverId != undefined) {
                    img.appendTo("ul#custom-images");
                } else {
                    img.appendTo("ul#standard-images");
                }
            } else {
                img.appendTo("ul#standard-images");
            }
        });
    }
}

function update_wizard_flavors(){
    // sliders for selecting VM flavor
    $("#cpu:range").rangeinput({min:0,
                               value:0,
                               step:1,
                               progress: true,
                               max:cpus.length-1});

    $("#storage:range").rangeinput({min:0,
                               value:0,
                               step:1,
                               progress: true,
                               max:disks.length-1});

    $("#ram:range").rangeinput({min:0,
                               value:0,
                               step:1,
                               progress: true,
                               max:ram.length-1});
    $("#small").click();

    // update the indicators when sliding
    $("#cpu:range").data().rangeinput.onSlide(function(event,value){
        $("#cpu-indicator")[0].value = cpus[Number(value)];
        $("#cpu-indicator").addClass('selectedrange');
    });
    $("#cpu:range").data().rangeinput.change(function(event,value){
        $("#cpu-indicator")[0].value = cpus[Number(value)];
        $("#custom").click();
        $("#cpu-indicator").removeClass('selectedrange');
    });
    $("#ram:range").data().rangeinput.onSlide(function(event,value){
        $("#ram-indicator")[0].value = ram[Number(value)];
        $("#ram-indicator").addClass('selectedrange');
    });
    $("#ram:range").data().rangeinput.change(function(event,value){
        $("#ram-indicator")[0].value = ram[Number(value)];
        $("#custom").click();
        $("#ram-indicator").removeClass('selectedrange');
    });
    $("#storage:range").data().rangeinput.onSlide(function(event,value){
        $("#storage-indicator")[0].value = disks[Number(value)];
        $("#storage-indicator").addClass('selectedrange');
    });
    $("#storage:range").data().rangeinput.change(function(event,value){
        $("#storage-indicator")[0].value = disks[Number(value)];
        $("#custom").click();
        $("#storage-indicator").removeClass('selectedrange');
    });
}

Array.prototype.unique = function () {
    var r = new Array();
    o:for(var i = 0, n = this.length; i < n; i++)
    {
        for(var x = 0, y = r.length; x < y; x++)
        {
            if(r[x]==this[i])
            {
                continue o;
            }
        }
        r[r.length] = this[i];
    }
    return r;
}

// get and configure flavor selection
function update_flavors() {
    $.ajax({
        url: API_URL + '/flavors/detail',
        type: "GET",
        //async: false,
        dataType: "json",
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                ajax_error(jqXHR.status, undefined, 'Update Flavors', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
            // start updating vm list
            update_vms(UPDATE_INTERVAL);
        },
        success: function(data, textStatus, jqXHR) {

            try {
                flavors = data.flavors.values;
                jQuery.parseJSON(data);
                $.each(flavors, function(i, flavor) {
                    cpus[i] = flavor['cpu'];
                    disks[i] = flavor['disk'];
                    ram[i] = flavor['ram'];
                });
                cpus = cpus.unique();
                disks = disks.unique();
                ram = ram.unique();
                update_wizard_flavors();
            } catch(err){
                ajax_error("NO_FLAVORS");
            }
            // start updating vm list
            update_vms(UPDATE_INTERVAL);
        }
    });
    return false;
}

// return flavorRef from cpu, disk, ram values
function identify_flavor(cpu, disk, ram){
    for (i=0;i<flavors.length;i++){
        if (flavors[i]['cpu'] == cpu && flavors[i]['disk']==disk && flavors[i]['ram']==ram) {
            return flavors[i]['id']
        }
    }
    return 0;
}

// return image entry from imageRef
function get_image(imageRef) {
    for (i=0;i<images.length;i++){
        if (images[i]['id'] == imageRef) {
            return images[i];
        }
    }
    return 0;
}

// return machine entry from serverID
function get_machine(serverID) {
    for (i=0;i<servers.length;i++){
        if (servers[i]['id'] == serverID) {
            return servers[i];
        }
    }
    return 0;
}

// update the actions in icon view, per server
function update_iconview_actions(serverID, server_status) {
    if ($.cookie("view")=='2') {
        // remove .disable from all actions to begin with
        $('#machinesview-single #' + serverID + ' div.single-action').show();
        // decide which actions should be disabled
        for (current_action in actions) {
            if (actions[current_action].indexOf(server_status) == -1 ) {
                $('#machinesview-single #' + serverID + ' div.action-' + current_action).hide();
            }
        }
    } else {
        // remove .disable from all actions to begin with
        $('#machinesview-icon.standard #' + serverID + ' div.actions').find('a').removeClass('disabled');
        // decide which actions should be disabled
        for (current_action in actions) {
            if (actions[current_action].indexOf(server_status) == -1 ) {
                $('#machinesview-icon.standard #' + serverID + ' a.action-' + current_action).addClass('disabled');
            }
        }
    }
}

// update the actions in list view
function update_listview_actions() {
    var states = [];
    var on = [];
    var checked = $("table.list-machines tbody input[type='checkbox']:checked");
    // disable all actions to begin with
    $('#machinesview .list div.actions').children().removeClass('enabled');

    // are there multiple machines selected?
    if (checked.length>1)
        states[0] = 'multiple';

    // check the states of selected machines
    checked.each(function(i,checkbox) {
        states[states.length] = checkbox.className;
        var ip = $("#" + checkbox.id.replace('input-','') + ".ip span.public").text();
        if (ip.replace('undefined','').length)
            states[states.length] = 'network';
    });

    // decide which actions should be enabled
    for (a in actions) {
        var enabled = false;
        for (var s =0; s<states.length; s++) {
            if (actions[a].indexOf(states[s]) != -1 ) {
                enabled = true;
            } else {
                enabled = false;
                break;
            }
        }
        if (enabled)
            on[on.length]=a;
    }
    // enable those actions
    for (action in on) {
        $("#action-" + on[action]).addClass('enabled');
    }
}

//create server action
function create_vm(machineName, imageRef, flavorRef){
    var image_logo = os_icon(get_image(imageRef).metadata);
    var uri = API_URL + '/servers';
    var payload = {
        "server": {
            "name": machineName,
            "imageRef": imageRef,
            "flavorRef" : flavorRef,
            "metadata" : {
                "OS" : image_logo
            }
        }
    };

    $.ajax({
    url: uri,
    type: "POST",
    contentType: "application/json",
    dataType: "json",
    data: JSON.stringify(payload),
    timeout: TIMEOUT,
    error: function(jqXHR, textStatus, errorThrown) {
                // close wizard and show error box
                $('#machines-pane a#create').data('overlay').close();
                    try {
                        display_failure(jqXHR.status, serverID, 'Create VM', jqXHR.responseText);
                    } catch(err) {
                        //if jqXHR.status is throwing an exception, the server has timed out
                        ajax_error(err);
                    }
           },
    success: function(data, textStatus, jqXHR) {
                if ( jqXHR.status == '202') {
                    ajax_success("CREATE_VM_SUCCESS", data.server.adminPass);
                } else {
                    // close wizard and show error box
                    $('#machines-pane a#create').data('overlay').close();
                    ajax_error(jqXHR.status, undefined, 'Create VM', jqXHR.responseText);
                }
            }
    });
}

// reboot action
function reboot(serverIDs){
    if (!serverIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post reboot call
    var payload = {
        "reboot": {"type" : "HARD"}
    };

    var serverID = serverIDs.pop();

    $.ajax({
        url: API_URL + '/servers/' + serverID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Reboot', jqXHR.responseText);
                    } catch(err) {
                        //if jqXHR.status is throwing an exception, the server has timed out
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '202') {
                        try {
                            console.info('rebooted ' + serverID);
                        } catch(err) {}
                        // indicate that the action succeeded
                        display_success(serverID);
                        // continue with the rest of the servers
                        reboot(serverIDs);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Reboot', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// shutdown action
function shutdown(serverIDs) {
    if (!serverIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post shutdown call
    var payload = {
        "shutdown": {}
    };

    var serverID = serverIDs.pop();

    $.ajax({
        url: API_URL + '/servers/' + serverID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Shutdown', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '202') {
                        try {
                            console.info('suspended ' + serverID);
                        } catch(err) {}
                        // indicate that the action succeeded
                        display_success(serverID);
                        // continue with the rest of the servers
                        shutdown(serverIDs);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Shutdown', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// destroy action
function destroy(serverIDs) {
    if (!serverIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post destroy call can have an empty request body
    var payload = {};

    var serverID = serverIDs.pop();

    $.ajax({
        url: API_URL + '/servers/' + serverID,
        type: "DELETE",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Destroy', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '204') {
                        try {
                            console.info('destroyed ' + serverID);
                        } catch (err) {}
                        // indicate that the action succeeded
                        display_success(serverID);
                        // continue with the rest of the servers
                        destroy(serverIDs);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Destroy', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// start action
function start(serverIDs){
    if (!serverIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post start call
    var payload = {
        "start": {}
    };

    var serverID = serverIDs.pop();

    $.ajax({
        url: API_URL + '/servers/' + serverID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Start', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '202') {
                        try {
                            console.info('started ' + serverID);
                        } catch(err) {}
                        // indicate that the action succeeded
                        display_success(serverID);
                        // continue with the rest of the servers
                        start(serverIDs);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Start', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// Show VNC console
function vnc_attachment(host, port, password) {
    // FIXME: Must be made into parameters, in settings.py
    //vnc = open("", "displayWindow",
    //    "status=yes,toolbar=yes,menubar=yes");
    vd = document.open("application/x-vnc");

    vd.writeln("[connection]");
    vd.writeln("host=" + host);
    vd.writeln("port=" + port);
    vd.writeln("password=" + password);

    vd.close();
}

// Show VNC console
function show_vnc_console(serverID, serverName, serverIP, host, port, password) {
    var params_url = '?machine=' + serverName + '&host_ip=' + serverIP + '&host=' + host + '&port=' + port + '&password=' + password;
    var params_window = 'scrollbars=no,' +
                        'menubar=no,' +
                        'toolbar=no,' +
                        'status=no,' +
                        'top=0,' +
                        'left=0,' +
                        'height=' + screen.height + ',' +
                        'width=' + screen.width + ',' +
                        'fullscreen=yes';

    window.open('machines/console' + params_url, 'formresult' + serverID, params_window);

    // Restore os icon in list view
    osIcon = $('#'+serverID).parent().parent().find('.list-logo');
    osIcon.attr('src',osIcon.attr('os'));
    return false;
}

// console action
function open_console(serverIDs){
    if (!serverIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post start call
    var payload = {
        "console": {"type": "vnc"}
    };

    var serverID = serverIDs.pop();

    var machine = get_machine(serverID);
    var serverName = machine.name;
    var serverIP = machine.addresses.values[0].values[0].addr;

    $.ajax({
        url: API_URL + '/servers/' + serverID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Console', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '200') {
                        try {
                            console.info('got_console ' + serverID);
                        } catch(err) {}
                        // indicate that the action succeeded
                        // show_vnc_console(serverID, serverName, serverIP,
                        // data.console.host,data.console.port,data.console.password);
                        show_vnc_console(serverID, serverName, serverIP,
                                         data.console.host,data.console.port,data.console.password);
                        display_success(serverID);
                        // hide spinner
                        $('#' + serverID + ' .spinner').hide();
                        // continue with the rest of the servers
                        open_console(serverIDs);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Console', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// rename server
function rename(serverID, serverName){
    if (!serverID.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // ajax post rename call
    var payload = {
        "server": {"name": serverName}
    };

    $.ajax({
        url: API_URL + '/servers/' + serverID,
        type: "PUT",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
                    try {
                        display_failure(jqXHR.status, serverID, 'Rename', jqXHR.responseText);
                    } catch(err) {
                        ajax_error(err);
                    }
                },
        success: function(data, textStatus, jqXHR) {
                    if ( jqXHR.status == '204' || jqXHR.status == '1223') {
                        try {
                            console.info('renamed ' + serverID);
                        } catch(err) {}
                        // indicate that the action succeeded
                        display_success(serverID);
                    } else {
                        ajax_error(jqXHR.status, serverID, 'Rename', jqXHR.responseText);
                    }
                }
    });
    return false;
}

// get server metadata
function get_metadata(serverID, keys_only) {
    $.ajax({
        url: API_URL + '/servers/' + serverID + '/meta',
        cache: false,
        type: "GET",
        //async: false,
        dataType: "json",
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                // close wizard and show error box
                $("a#metadata-scrollable").data('overlay').close();
                ajax_error(jqXHR.status, undefined, 'Get metadata', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            // to list the new results in the edit dialog
            if (keys_only) {
                list_metadata_keys(serverID, data.metadata.values);
            } else {
                list_metadata(data);
                list_metadata_keys(serverID, data.metadata.values);
            }
            //hide spinner
            $('#metadata-wizard .large-spinner').hide();
        }
    });
    return false;
}

// delete metadata key-value pair
function delete_metadata(serverID, meta_key) {
    $.ajax({
        url: API_URL + '/servers/' + serverID + '/meta/' + meta_key,
        type: "DELETE",
        //async: false,
        dataType: "json",
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                // close wizard and show error box
                $("a#metadata-scrollable").data('overlay').close();
                ajax_error(jqXHR.status, undefined, 'Delete metadata', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
                    // success: Do nothing, the UI is already updated
        }
    });
    return false;
}

// add metadata key-value pair
function update_metadata(serverID, meta_key, meta_value) {
    var payload = {
        "meta": {
        }
    };
    payload["meta"][meta_key] = meta_value;

    $.ajax({
        url: API_URL + '/servers/' + serverID + '/meta/' + meta_key,
        type: "PUT",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                // close wizard and show error box
                $("a#metadata-scrollable").data('overlay').close();
                ajax_error(jqXHR.status, undefined, 'add metadata', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            // success: Update icons if meta key is OS
            if (meta_key == "OS") {
                $("#metadata-wizard .machine-icon").attr("src","static/icons/machines/small/" + os_icon_from_value(meta_value) + '-' + $("#metadata-wizard div#on-off").text() + '.png');
                $("#machinesview-icon").find("div#" + serverID).find("img.logo").attr("src", "static/icons/machines/medium/" + os_icon_from_value(meta_value) + '-' + $("#metadata-wizard div#on-off").text() + '.png');
            }
        }
    });
    return false;
}

// create network
function create_network(networkName){
    // ajax post start call
    var payload = {
        "network": { "name": networkName }
    };

    $.ajax({
        url: API_URL + '/networks',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                // close wizard and show error box
                $("a#networkscreate").overlay().close();
                ajax_error(jqXHR.status, undefined, 'Create network', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            if ( jqXHR.status == '202') {
                try {
                    console.info('created network ' + networkName);
                } catch(err) {}
                /*
                On success of this call nothing happens.
                When the UI gets the first update containing the created server,
                the creation wizard is closed and the new network is inserted
                to the DOM. This is done in update_networks_view()
                */
            } else {
                // close wizard and show error box
                $("a#networkscreate").overlay().close();
                ajax_error(jqXHR.status, undefined, 'Create network', jqXHR.responseText);
            }
        }
    });
    return false;
}

// rename network
function rename_network(networkID, networkName){
    if (!networkID.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // prepare payload
    var payload = {
        "network": {"name": networkName}
    };
    // ajax call
    $.ajax({
        url: API_URL + '/networks/' + networkID,
        type: "PUT",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                ajax_error(jqXHR.status, undefined, 'Rename network', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            if ( jqXHR.status == '204') {
                try {
                    console.info('renamed network' + networkID);
                } catch(err) {}
            } else {
                ajax_error(jqXHR.status, undefined, 'Rename network', jqXHR.responseText);
            }
        }
    });
    return false;
}

function delete_network(networkIDs){
    if (!networkIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // get a network
    var networkID = networkIDs.pop();
    // ajax post destroy call can have an empty request body
    var payload = {};
    // ajax call
    $.ajax({
        url: API_URL + '/networks/' + networkID,
        type: "DELETE",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                display_failure(jqXHR.status, networkID, 'Delete', jqXHR.responseText)
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            if ( jqXHR.status == '204') {
                try {
                    console.info('deleted network ' + networkID);
                } catch(err) {}
                // continue with the rest of the servers
                delete_network(networkIDs);
            } else {
                ajax_error(jqXHR.status, undefined, 'Delete network', jqXHR.responseText);
            }
        }
    });
    return false;
}

function add_server_to_network(networkID, serverIDs) {
    if (!serverIDs.length){
        // close the overlay when all the calls are made
        $("a#add-machines-overlay").overlay().close();
        return false;
    }
    // get a server
    var serverID = serverIDs.pop();
    // prepare payload
    var payload = {
            "add": { "serverRef": serverID }
        };
    // prepare ajax call
    $.ajax({
        url: API_URL + '/networks/' + networkID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                // close wizard and show error box
                $("a#add-machines-overlay").data('overlay').close();
                ajax_error(jqXHR.status, undefined, 'Add server to network', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            if ( jqXHR.status == '202') {
                try {
                    console.info('added server ' + serverID + ' to network ' + networkID);
                } catch(err) {}
                // continue with the rest of the servers
                add_server_to_network(networkID, serverIDs);
            } else {
                // close wizard and show error box
                $("a#add-machines-overlay").data('overlay').close();
                ajax_error(jqXHR.status, undefined, 'Add server to network', jqXHR.responseText);
            }
        }
    });
    return false;
}

function remove_server_from_network(networkIDs, serverIDs) {
    if (!networkIDs.length){
        //ajax_success('DEFAULT');
        return false;
    }
    // get a network and a server
    var networkID = networkIDs.pop();
    var serverID = serverIDs.pop();
    // prepare payload
    var payload = {
            "remove": { "serverRef": serverID }
        };
    // prepare ajax call
    $.ajax({
        url: API_URL + '/networks/' + networkID + '/action',
        type: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: TIMEOUT,
        error: function(jqXHR, textStatus, errorThrown) {
            try {
                ajax_error(jqXHR.status, undefined, 'Remove server form network', jqXHR.responseText);
            } catch (err) {
                ajax_error(err);
            }
        },
        success: function(data, textStatus, jqXHR) {
            if ( jqXHR.status == '202') {
                try {
                    console.info('deleted server ' + serverID + ' from network ' + networkID);
                } catch(err) {}
                // remove it from DOM
                // $('#net-' + networkID + '-server-' + serverID).fadeOut('slow').remove();
                // continue with the rest of the servers
                remove_server_form_network(networkIDs, serverIDs);
            } else {
                ajax_error(jqXHR.status, undefined, 'Remove server form network', jqXHR.responseText);
            }
        }
    });
    return false;
}

// show the welcome screen
function showWelcome() {
    $("#view-select").fadeOut("fast");
    $("#emptymachineslist").fadeIn("fast");
    $("#machinesview").hide();
}

// hide the welcome screen
function hideWelcome() {
    $("#emptymachineslist").fadeOut("fast");
    $("#view-select").fadeIn("fast");
    $("div#view-select").show();
    $("#machinesview").show();
}

function log_server_status_change(server_entry, new_status) {
    // firebug console logging
    try {
        if ($("#machinesview-single").length > 0) {
            console.info(server_entry.find("div.machine-details div.name").text() +
                        ' from ' + server_entry.find(".state-label").text() +
                        ' to ' + STATUSES[new_status]);
        } else {
            console.info(server_entry.find("div.name span.name").text() +
                        ' from ' + server_entry.find(".status").text() +
                        ' to ' + STATUSES[new_status]);
        }
    } catch(err) {}
}

function get_flavor_params(flavorRef) {
    var cpus, ram, disk;
    if ( flavors.length > 0 ) {
        var current_flavor = '';
        for (i=0; i<flavors.length; i++) {
            if (flavors[i]['id'] == flavorRef) {
                current_flavor = flavors[i];
            }
        }
        cpus = current_flavor['cpu'];
        ram = current_flavor['ram'];
        disk = current_flavor['disk'];
    } else {
        cpus = 'undefined';
        ram = 'undefined';
        disk = 'undefined';
    }
    return {'cpus': cpus, 'ram': ram, 'disk': disk};
}

function get_image_params(imageRef) {
    var image_name, image_size;
    if ( images.length > 0 ) {
        var current_image = '';
        for (i=0; i<images.length; i++) {
            if (images[i]['id'] == imageRef) {
                current_image = images[i];
            }
        }
        try {
            image_name = current_image['name'];
        } catch(err) { image_name = 'undefined'; }
        try{
            image_size = current_image['metadata']['values']['size'];
        } catch(err) { image_size = 'undefined'; }
    } else {
        image_name = 'undefined';
        image_size = 'undefined';
    }
    return {'name': image_name,'size': image_size};
}

function get_public_ips(server) {
    var ip4, ip6;
    try {
        if (server.addresses.values) {
            $.each (server.addresses.values, function(i, value) {
                if (value.id == 'public') {
                    try {
                        $.each (value.values, function(i, ip) {
                            if (ip.version == '4') {
                                ip4 = ip.addr;
                            } else if (ip.version == '6') {
                                ip6 = ip.addr;
                            } else {
                                ip4 = 'undefined';
                                ip6 = 'undefined';
                            }
                        });
                    } catch (err){
                        try{console.info('Server ' + server.id + ' has invalid ips')}catch(err){};
                        ip4 = 'undefined';
                        ip6 = 'undefined';
                    }
                }
            });
        }
    } catch (err) {
        try{console.info('Server ' + server.id + ' has no network addresses')}catch(err){};
        ip4 = 'undefined';
        ip6 = 'undefined';
    }
    return {'ip4': ip4, 'ip6': ip6};
}

function get_private_ips(server) {

}

function close_all_overlays() {
	try {
		$("a#networkscreate").overlay().close();
	} catch(err) {}
	try {
		$('a#create').overlay().close();
	} catch(err) {}
	try {
		$("a#add-machines-overlay").overlay().close();
	} catch(err) {}
	try {
		$("a#metadata-scrollable").overlay().close();
	} catch(err) {}	
}
