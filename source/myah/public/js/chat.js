'use strict';

const FILE_SLICE_SIZE_B = 100000;

let socket;
let logged_in_as = '';
let imgcount = 0;

const fileTransferTasks = new Map();

$(function() {
    logged_in_as = Cookies.get('username');
    const createHandshakeQuery = () => { return {username : logged_in_as, token : Cookies.get('auth_token')}; };
    socket = io({query : createHandshakeQuery(), rejectUnauthorized : false});

    $('#btnSend').click(() => {
        socket.emit('chat/message', {username : logged_in_as, payload : $('#m').val()});
        $('#m').val('');
        return false;
    });
    socket.on('chat/message', (pkt) => {
        displayMessage(pkt.postid, pkt.username, pkt.payload, pkt.timestamp);
        if(pkt.username !== logged_in_as)
            notifyMe(pkt.username, pkt.payload);
    });
    socket.on('chat/history', (pkt) => {
        $('#messages').html('');
        pkt.history.forEach((msg) => { displayMessage(msg.postid, msg.username, msg.payload, msg.timestamp); });
    });
    socket.on('connect', () => {
        socket.emit('chat/get', {last : 50}); // Retrieve last 50 posts
        console.log(`connected, socket ID: ${socket.id}`);
    });
    socket.on('reconnect_attempt', () => {
        socket.io.opts.query = createHandshakeQuery();
        console.log('attempting to reconnect');
    });
    socket.on('error', (err) => { console.error(err); });

    setupFileDnD();
    setupFileTransfer();

    // Events
    $(document).keydown(function(e) {
        switch(e.which)
        {
        case 13: // Shift+Enter: send text
            if(e.shiftKey)
            {
                $('#btnSend').click();
                e.preventDefault(); // prevent the default action (scroll / move caret)
            }
            break;
        default:
            return; // exit this handler for other keys
        }
    });
});



function displayMessage(postid, username, message, timestamp)
{
    const other = (username !== logged_in_as);
    const bubble_style = `bubble bubble-spk${(other ? ' other' : '')}`;
    const bubble_user_style = `bubble-user${(other ? ' other' : '')}`;
    const template = '<div id="{{postid}}" class="{{bubble_style}}"><div class="bubble-content">{{message}}</div><div class="{{bubble_user_style}}"><strong>{{username}}</strong><br/><small>{{date}}</small></div></div>';
    const html = Mustache.render(template, {
        postid : postid,
        bubble_style : bubble_style,
        bubble_user_style : bubble_user_style,
        message : message,
        username : username,
        date : timestampToDateString(timestamp)
    });
    $("#messages").prepend(html);
    $(`#messages>div#${postid}`).linkify();
    parseImages($(`#messages>div#${postid}>div>a`));
    setImageCallbacks($(`#messages>div#${postid}>div>img`));
    decorate($(`#messages>div#${postid}`));
}

function timestampToDateString(timestamp)
{
    const date = new Date(timestamp);
    return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + date.getHours() + ":" +
           date.getMinutes() + ":" + date.getSeconds();
}

function parseImages(selector)
{
    selector.each(function() {
        const ext = getFileExtension(this.href);
        switch(ext)
        {
        case '.gif':
        case '.png':
        case '.jpg':
        case '.jpeg':
            var img = $('<img>', {src : this.href, class : "bubble-image", id : imgcount});
            $(this).replaceWith(img);
            break;
        }
        ++imgcount;
    });
}

function setImageCallbacks(selector)
{
    selector.each(function() {
        $(this).click(() => {
            if($(this).width() <= 200)
                $(this).animate({"max-width" : "700px", "max-height" : "700px"}, 500);
            else
                $(this).animate({"max-width" : "200px", "max-height" : "200px"}, 500);
        });
    });
}

function decorate(selector)
{
    if(selector.hasClass("other"))
        return;

    const postid = selector.attr('id');
    selector.prepend(`<div class="bubble-cross" id="${postid}">&#10008;</div>`);
    selector.children(":first").click(() => {
        selector.remove();
        socket.emit('chat/delete', {postid : postid});
    });
}

function getFileExtension(filename)
{
    var dot = filename.lastIndexOf(".");
    if(dot == -1)
        return "";
    var extension = filename.substr(dot, filename.length);
    return extension;
}

function notifyMe(sender, message)
{
    // Does the browser support notifications?
    if(!("Notification" in window)) return;

    // Find first link in message if any
    const links = linkify.find(message);
    const linkhref = (links.length != 0) ? links[0].href : '';
    const caption = `[${sender}] ${message.substring(0,25)}`;

    const options = {
        data : {href : linkhref},
        lang : 'fr-FR',
        icon : '/static/img/favicon-32x32.png',
        timestamp : Date.now()
    };

    let notification = undefined;

    // Check permission
    if(Notification.permission === "granted")
        notification = new Notification(caption, options);
    else if(Notification.permission !== 'denied')
    {
        Notification.requestPermission(function(permission) {
            // Store permission information
            if(!('permission' in Notification))
                Notification.permission = permission;

            // User is ok, notify
            if(permission === "granted")
                notification = new Notification(caption, options);
        });
    }

    if(notification)
    {
        if(linkhref !== "")
        {
            notification.addEventListener('click', function() {
                window.open(linkhref);
                notification.close();
            });
            setTimeout(notification.close.bind(notification), 9000);
        }
        else
            setTimeout(notification.close.bind(notification), 5000);
    }
}

function setupFileDnD()
{
    $("#dropzone").hide();

    //Prevent browser from displaying file on drag/drop
    $("body").on('dragenter dragstart dragend dragleave dragover drag drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
    });
    $("#m").on('dragenter', function (e) {
        const padding    = parseInt($("#controls").css("padding"));
        const zonewidth  = parseInt($("#m").css("width")) - padding;
        const zoneheight = parseInt($("#m").css("height")) - padding;
        $("#dropzone").css("width", zonewidth);
        $("#dropzone").css("height", zoneheight);
        e.preventDefault();
        e.stopPropagation();
        $("#dropzone").show();
    });
    $("#dropzone").on('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $("#dropzone").hide();
    });
    $("#dropzone").on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $("#dropzone").hide();
        if(e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files.length)
            uploadFiles(e.originalEvent.dataTransfer.files);
    });
}

function setupFileTransfer()
{
    socket.on('upload/request/slice', (data) => {
        const place = data.currentSlice * FILE_SLICE_SIZE_B;
        const task  = fileTransferTasks.get(data.name);
        const slice = task.file.slice(place, place + Math.min(FILE_SLICE_SIZE_B, task.file.size - place)); 
        
        task.reader.readAsArrayBuffer(slice); 
    });
    socket.on('upload/end', (data) => { 
        console.log(`File transfer complete for ${data.name}.`);
        fileTransferTasks.delete(data.name);
    });
    socket.on('upload/error', (data) => { 
        console.error(`Upload error for: ${data.name}.`);
        fileTransferTasks.delete(data.name);
    });
}

function uploadFiles(files)
{
    console.log(`Beginning file transfer:`);
    console.log(files);

    for(var ii=0; ii<files.length; ++ii)
    {
        (function(file) {
            if(file.name.length <= 255)
                sendFile(file);
        })(files[ii]);
    }
}

function sendFile(file)
{
    console.log(`Sending: ${file.name} - Size: ${file.size}B`);
    const fileReader = new FileReader();
    const slice = file.slice(0, FILE_SLICE_SIZE_B);

    if(!fileTransferTasks.has(file.name))
    {
        fileTransferTasks.set(file.name, {
            file: file,
            reader: fileReader,
            progress: 0
        });
    }

    fileReader.readAsArrayBuffer(slice);
    fileReader.onload = () => {
        const arrayBuffer = fileReader.result;
        fileTransferTasks.get(file.name).progress += arrayBuffer.byteLength;
        updateFileUploadProgress(logged_in_as, file.name, fileTransferTasks.get(file.name).progress, file.size);

        socket.emit('upload/slice', {
            user: logged_in_as,
            name: file.name,
            type: file.type,
            size: file.size,
            data: arrayBuffer
        }); 
    };
    fileReader.onerror = (err) => {
        console.error(err);
    };
}

function updateFileUploadProgress(username, filename, current_size, total_size)
{
    const progress = progressPercent(current_size, total_size);
    const id = hashFnv32a(filename);
    const found = $(`#messages>div#fp-${id}`);
    if(found.length)
    {
        $(`#messages>div#fp-${id}>div>.prgBarFront`).css("width", progress+"%");
        $(`#messages>div#fp-${id}>div>.prgBarText`).text(progress + "%");
    }
    else
    {
        const template =`
        <div class="bubble notify" id="fp-{{id}}">{{username}} - uploading: {{filename}} ({{size}}B)
            <div class="prgBar">
                <div class="prgBarBack">&nbsp;</div>
                <div class="prgBarFront">&nbsp;</div>
                <div class="prgBarText">{{progress}}%</div>
            </div>
        </div>`;
        const html = Mustache.render(template, {
            id: id,
            username: username,
            filename: shortenFileName(filename, 50),
            size: total_size,
            progress: progress
        });
        $("#messages").prepend(html);
    }
}

function progressPercent(current_size, total_size)
{
    return Math.round(100 * current_size / total_size);
}

function hashFnv32a(str, asString, seed)
{
    var i, l,
        hval = (seed === undefined) ? 0x811c9dc5 : seed;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    if( asString ){
        // Convert to 8 digit hex string
        return ("0000000" + (hval >>> 0).toString(16)).substr(-8);
    }
    return hval >>> 0;
}

function shortenFileName(fileName, maxlen)
{
    if (fileName.length > maxlen+3) {
        const shortfileName = fileName.substring(0,maxlen-3);
        fileName = fileName.replace(/(?:.*)\.(\w*)/g, shortfileName + '...$1');
    }
    return fileName;
}

/*
case "file/prog":
    //server side: {"action": u"file/prog", "user": username, "name": filename, "size": filesize, "id": namehash, "progress": 0}
    //Get bubble if exists, create a new one if not
    var $bubble = $('div#fp-' + e.id).length ? $('div#fp-' + e.id) : $('<div class="bubble notify" id="fp-' + e.id + '">' + e.user + ' - uploading: ' + LChat.shortenFileName(e.name, 50) + '(' + e.size + 'B)\
                                                                            <div class="prgBar" id="pb-' + e.id + '">\
                                                                            <div class="prgBarBack" id="pbb-' + e.id + '">&nbsp;</div>\
                                                                            <div class="prgBarFront" id="pbf-' + e.id + '">&nbsp;</div>\
                                                                            <div class="prgBarText" id="pbt-' + e.id + '">' + e.progress + '%\
                                                                        </div>\
                                                                        </div>').prependTo($("#message-container"));

    $("div#pbf-" + e.id).css("width", parseInt(e.progress)+"%");
    $("div#pbt-" + e.id).text(e.progress + "%");
    break;

case "file/done":
    //server side: {"action": u"file/done", "user": username, "name": filename, "id": staticMsgDict[namehash], "url": fileurl}
    $('div#fp-' + e.id).empty();
    $('div#fp-' + e.id).html(e.user + ' - uploaded: ' + LChat.shortenFileName(e.name, 50) + '<br/><a href="' + e.url + '" download="' + e.name + '">[DOWNLOAD]</a>');
    LChat.addFile(e.key, e.name, e.url);
    break;


function displayMessage(postid, username, message, timestamp)
{
    const other = (username !== logged_in_as);
    const bubble_style = `bubble bubble-spk${(other ? ' other' : '')}`;
    const bubble_user_style = `bubble-user${(other ? ' other' : '')}`;
    const template = '<div id="{{postid}}" class="{{bubble_style}}"><div class="bubble-content">{{message}}</div><div class="{{bubble_user_style}}"><strong>{{username}}</strong><br/><small>{{date}}</small></div></div>';
    const html = Mustache.render(template, {
        postid : postid,
        bubble_style : bubble_style,
        bubble_user_style : bubble_user_style,
        message : message,
        username : username,
        date : timestampToDateString(timestamp)
    });
    $("#messages").prepend(html);
    $(`#messages>div#${postid}`).linkify();
    parseImages($(`#messages>div#${postid}>div>a`));
    setImageCallbacks($(`#messages>div#${postid}>div>img`));
    decorate($(`#messages>div#${postid}`));
}
*/

