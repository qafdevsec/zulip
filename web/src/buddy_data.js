import $ from "jquery";

import render_empty_list_widget_for_list from "../templates/empty_list_widget_for_list.hbs";

import * as blueslip from "./blueslip";
import * as hash_util from "./hash_util";
import {$t} from "./i18n";
import * as muted_users from "./muted_users";
import * as narrow_state from "./narrow_state";
import {page_params} from "./page_params";
import * as people from "./people";
import * as presence from "./presence";
import * as stream_data from "./stream_data";
import * as timerender from "./timerender";
import * as unread from "./unread";
import {user_settings} from "./user_settings";
import * as user_status from "./user_status";
import * as util from "./util";

/*

   This is the main model code for building the buddy list.
   We also rely on presence.js to compute the actual presence
   for users.  We glue in other "people" data and do
   filtering/sorting of the data that we'll send into the view.

*/

export const max_size_before_shrinking = 600;

let is_searching_users = false;

// TODO: This should ideally be in buddy_list.js since it uses jquery,
// but can't be easily placed there due to import cycles.
function update_empty_list_placeholders() {
    const empty_list_message = is_searching_users
        ? $t({defaultMessage: "No matching users."})
        : $t({defaultMessage: "None."});

    $("#buddy-list-other-users").data("search-results-empty", empty_list_message);
    if ($("#buddy-list-other-users .empty-list-message").length) {
        const empty_list_widget = render_empty_list_widget_for_list({empty_list_message});
        $("#buddy-list-other-users").empty();
        $("#buddy-list-other-users").append(empty_list_widget);
    }

    $("#buddy-list-users-matching-view").data("search-results-empty", empty_list_message);
    if ($("#buddy-list-users-matching-view .empty-list-message").length) {
        const empty_list_widget = render_empty_list_widget_for_list({empty_list_message});
        $("#buddy-list-users-matching-view").empty();
        $("#buddy-list-users-matching-view").append(empty_list_widget);
    }
}

export function set_is_searching_users(val) {
    if (is_searching_users === val) {
        return;
    }
    is_searching_users = val;
    update_empty_list_placeholders();
}

export function get_user_circle_class(user_id) {
    const status = presence.get_status(user_id);

    switch (status) {
        case "active":
            return "user_circle_green";
        case "idle":
            return "user_circle_idle";
        default:
            return "user_circle_empty";
    }
}

export function level(user_id) {
    // Put current user at the top, unless we're in a user search view.
    if (people.is_my_user_id(user_id) && !is_searching_users) {
        return 0;
    }

    const status = presence.get_status(user_id);

    switch (status) {
        case "active":
            return 1;
        case "idle":
            return 2;
        default:
            return 3;
    }
}

export function user_matches_narrow(user_id, stream_id, pm_ids) {
    if (stream_id) {
        return stream_data.is_user_subscribed(stream_id, user_id);
    }
    if (pm_ids.size > 0) {
        return pm_ids.has(user_id) || people.is_my_user_id(user_id);
    }
    return false;
}

export function compare_function(a, b, current_sub, pm_ids) {
    const a_would_receive_message = user_matches_narrow(a, current_sub?.stream_id, pm_ids);
    const b_would_receive_message = user_matches_narrow(b, current_sub?.stream_id, pm_ids);
    if (a_would_receive_message && !b_would_receive_message) {
        return -1;
    }
    if (!a_would_receive_message && b_would_receive_message) {
        return 1;
    }

    const level_a = level(a);
    const level_b = level(b);
    const diff = level_a - level_b;
    if (diff !== 0) {
        return diff;
    }

    // Sort equivalent direct message names alphabetically
    const person_a = people.maybe_get_user_by_id(a);
    const person_b = people.maybe_get_user_by_id(b);

    const full_name_a = person_a ? person_a.full_name : "";
    const full_name_b = person_b ? person_b.full_name : "";

    return util.strcmp(full_name_a, full_name_b);
}

export function sort_users(user_ids) {
    // TODO sort by unread count first, once we support that
    const current_sub = narrow_state.stream_sub();
    const pm_ids_string = narrow_state.pm_ids_string();
    const pm_ids_list = pm_ids_string ? people.user_ids_string_to_ids_array(pm_ids_string) : [];
    const pm_ids_set = new Set(pm_ids_list);
    user_ids.sort((a, b) => compare_function(a, b, current_sub, pm_ids_set));
    return user_ids;
}

function get_num_unread(user_id) {
    return unread.num_unread_for_user_ids_string(user_id.toString());
}

export function user_last_seen_time_status(user_id) {
    const status = presence.get_status(user_id);
    if (status === "active") {
        return $t({defaultMessage: "Active now"});
    }

    if (status === "idle") {
        // When we complete our presence API rewrite to have the data
        // plumbed, we may want to change this to also mention when
        // they were last active.
        return $t({defaultMessage: "Idle"});
    }

    const last_active_date = presence.last_active_date(user_id);
    if (page_params.realm_is_zephyr_mirror_realm) {
        // We don't send presence data to clients in Zephyr mirroring realms
        return $t({defaultMessage: "Activity unknown"});
    } else if (last_active_date === undefined) {
        // There are situations where the client has incomplete presence
        // history on a user.  This can happen when users are deactivated,
        // or when they just haven't been present in a long time (and we
        // may have queries on presence that go back only N weeks).
        //
        // We give this vague status for such users; we will get to
        // delete this code when we finish rewriting the presence API.
        return $t({defaultMessage: "Active more than 2 weeks ago"});
    }
    return timerender.last_seen_status_from_date(last_active_date);
}

export function info_for(user_id) {
    const user_circle_class = get_user_circle_class(user_id);
    const person = people.get_by_user_id(user_id);

    const status_emoji_info = user_status.get_status_emoji(user_id);
    const status_text = user_status.get_status_text(user_id);
    const user_list_style_value = user_settings.user_list_style;
    const user_list_style = {
        COMPACT: user_list_style_value === 1,
        WITH_STATUS: user_list_style_value === 2,
        WITH_AVATAR: user_list_style_value === 3,
    };

    return {
        href: hash_util.pm_with_url(person.email),
        name: person.full_name,
        user_id,
        status_emoji_info,
        is_current_user: people.is_my_user_id(user_id),
        num_unread: get_num_unread(user_id),
        user_circle_class,
        status_text,
        user_list_style,
        should_add_guest_user_indicator: people.should_add_guest_user_indicator(user_id),
    };
}

export function get_title_data(user_ids_string, is_group) {
    if (is_group === true) {
        // For groups, just return a string with recipient names.
        return {
            first_line: people.get_recipients(user_ids_string),
            second_line: "",
            third_line: "",
        };
    }

    // Since it's not a group, user_ids_string is a single user ID.
    const user_id = Number.parseInt(user_ids_string, 10);
    const person = people.get_by_user_id(user_id);

    if (person.is_bot) {
        const bot_owner = people.get_bot_owner_user(person);

        if (bot_owner) {
            const bot_owner_name = $t(
                {defaultMessage: "Owner: {name}"},
                {name: bot_owner.full_name},
            );

            return {
                first_line: person.full_name,
                second_line: bot_owner_name,
                third_line: "",
            };
        }

        // Bot does not have an owner.
        return {
            first_line: person.full_name,
            second_line: "",
            third_line: "",
        };
    }

    // For buddy list and individual direct messages.
    // Since is_group=False, it's a single, human user.
    const last_seen = user_last_seen_time_status(user_id);
    const is_my_user = people.is_my_user_id(user_id);

    // Users has a status.
    if (user_status.get_status_text(user_id)) {
        return {
            first_line: person.full_name,
            second_line: user_status.get_status_text(user_id),
            third_line: last_seen,
            show_you: is_my_user,
        };
    }

    // Users does not have a status.
    return {
        first_line: person.full_name,
        second_line: last_seen,
        third_line: "",
        show_you: is_my_user,
    };
}

export function get_item(user_id) {
    const info = info_for(user_id);
    return info;
}

export function get_items_for_users(user_ids) {
    const user_info = user_ids.map((user_id) => info_for(user_id));
    return user_info;
}

function user_is_recently_active(user_id) {
    // return true if the user has a green/orange circle
    return level(user_id) <= 2;
}

function maybe_shrink_list(user_ids, user_filter_text) {
    if (user_ids.length <= max_size_before_shrinking) {
        return user_ids;
    }

    if (user_filter_text) {
        // If the user types something, we want to show all
        // users matching the text, even if they have not been
        // online recently.
        // For super common letters like "s", we may
        // eventually want to filter down to only users that
        // are in presence.get_user_ids().
        return user_ids;
    }

    // We want to always show PM recipients even if they're inactive.
    const pm_ids_string = narrow_state.pm_ids_string();
    const pm_ids_list = pm_ids_string ? people.user_ids_string_to_ids_array(pm_ids_string) : [];
    const pm_ids_set = new Set(pm_ids_list);

    user_ids = user_ids.filter(
        (user_id) =>
            user_is_recently_active(user_id) || user_matches_narrow(user_id, null, pm_ids_set),
    );

    return user_ids;
}

function filter_user_ids(user_filter_text, user_ids) {
    // This first filter is for whether the user is eligible to be
    // displayed in the right sidebar at all.
    user_ids = user_ids.filter((user_id) => {
        const person = people.maybe_get_user_by_id(user_id);

        if (!person) {
            blueslip.warn("Got user_id in presence but not people: " + user_id);
            return false;
        }

        if (person.is_bot) {
            // Bots should never appear in the right sidebar.  This
            // case should never happen, since bots cannot have
            // presence data.
            return false;
        }

        if (muted_users.is_user_muted(user_id)) {
            // Muted users are hidden from the right sidebar entirely.
            return false;
        }

        return true;
    });

    if (!user_filter_text) {
        return user_ids;
    }

    // If a query is present in "Search people", we return matches.
    let search_terms = user_filter_text.toLowerCase().split(/[,|]+/);
    search_terms = search_terms.map((s) => s.trim());

    const persons = user_ids.map((user_id) => people.get_by_user_id(user_id));

    const user_id_dict = people.filter_people_by_search_terms(persons, search_terms);

    return [...user_id_dict.keys()];
}

function get_filtered_user_id_list(user_filter_text) {
    let base_user_id_list;

    if (user_filter_text) {
        // If there's a filter, select from all users, not just those
        // recently active.
        base_user_id_list = people.get_active_user_ids();
    } else {
        // From large realms, the user_ids in presence may exclude
        // users who have been idle more than three weeks.  When the
        // filter text is blank, we show only those recently active users.
        base_user_id_list = presence.get_user_ids();

        // Always include ourselves, even if we're "unavailable".
        const my_user_id = people.my_current_user_id();
        if (!base_user_id_list.includes(my_user_id)) {
            base_user_id_list = [my_user_id, ...base_user_id_list];
        }
    }

    const user_ids = filter_user_ids(user_filter_text, base_user_id_list);
    return user_ids;
}

export function get_filtered_and_sorted_user_ids(user_filter_text) {
    let user_ids;
    user_ids = get_filtered_user_id_list(user_filter_text);
    user_ids = maybe_shrink_list(user_ids, user_filter_text);
    return sort_users(user_ids);
}

export function matches_filter(user_filter_text, user_id) {
    // This is a roundabout way of checking a user if you look
    // too hard at it, but it should be fine for now.
    return filter_user_ids(user_filter_text, [user_id]).length === 1;
}
