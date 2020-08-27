'use strict';

let socket;
let logged_in_as = '';
let imgcount = 0;

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
        $(this).click(()=>{
            if($(this).width()<=200)
                $(this).animate({"max-width": "700px", "max-height": "700px"}, 500);
            else
                $(this).animate({"max-width": "200px", "max-height": "200px"}, 500);
        });
    });
}

function decorate(selector)
{
    if(selector.hasClass("other")) return;

    const postid = selector.attr('id');
    selector.prepend(`<div class="bubble-cross" id="${postid}">&#10008;</div>`);
    selector.children(":first").click(()=> {
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

$(function() {
    logged_in_as = Cookies.get('username');
    const createHandshakeQuery = () => { return {username : logged_in_as, token : Cookies.get('auth_token')}; };
    socket = io({query : createHandshakeQuery(), rejectUnauthorized : false});

    $('form').submit((e) => {
        e.preventDefault(); // prevents page reloading
        socket.emit('chat/message', {username : logged_in_as, payload : $('#m').val()});
        $('#m').val('');
        return false;
    });
    socket.on('chat/message', (pkt) => { displayMessage(pkt.postid, pkt.username, pkt.payload, pkt.timestamp); });
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