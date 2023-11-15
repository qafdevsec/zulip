"use strict";

const $ = require("./zjquery");

let users_matching_view = [];
exports.buddy_list_add_user_matching_view = (user_id, $stub) => {
    if ($stub.attr) {
        $stub.attr("data-user-id", user_id);
    }
    $stub.length = 1;
    users_matching_view.push(user_id);
    const sel = `li.user_sidebar_entry[data-user-id='${CSS.escape(user_id)}']`;
    $("#buddy-list-users-matching-view").set_find_results(sel, $stub);
    $("#buddy-list-other-users").set_find_results(sel, []);
};

let other_users = [];
exports.buddy_list_add_other_user = (user_id, $stub) => {
    if ($stub.attr) {
        $stub.attr("data-user-id", user_id);
    }
    $stub.length = 1;
    other_users.push(user_id);
    const sel = `li.user_sidebar_entry[data-user-id='${CSS.escape(user_id)}']`;
    $("#buddy-list-other-users").set_find_results(sel, $stub);
    $("#buddy-list-users-matching-view").set_find_results(sel, []);
};

exports.override_user_matches_narrow = (user_id) => users_matching_view.includes(user_id);

exports.clear_buddy_list = (buddy_list) => {
    buddy_list.populate({
        keys: [],
    });
    users_matching_view = [];
    other_users = [];
};
