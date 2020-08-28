'use strict';

const FILE_SLICE_SIZE_B = 100000;

let socket;
let logged_in_as = '';
let imgcount = 0;

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

const fileTransferTasks = new Map();

function sendFile(file)
{
    const fileReader = new FileReader();
    const slice = file.slice(0, FILE_SLICE_SIZE_B);

    if(!fileTransferTasks.has(file.name))
    {
        fileTransferTasks.set(file.name, {
            file: file,
            reader: fileReader
        });
    }

    fileReader.readAsArrayBuffer(slice);
    fileReader.onload = () => {
        console.log(`Sending: ${file.name} - Size: ${file.size}B`);
        const arrayBuffer = fileReader.result; 
        socket.emit('upload/slice', { 
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