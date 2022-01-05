// ==UserScript==
// @name         Nexus Mapper
// @version      2.dev.8
// @author       Goliath
// @description  Mapping tool for NC
//
// @namespace    https://github.com/DavidFerrerBeltran/
// @homepage     https://www.nexusclash.com/viewtopic.php?f=8&t=0 not yet enabled
// @source       https://github.com/DavidFerrerBeltran/NexusMapper/tree/dev
//
// @updateURL    https://github.com/DavidFerrerBeltran/NexusMapper/raw/dev/nexus-mapper.user.js
// @supportURL   https://github.com/DavidFerrerBeltran/NexusMapper/Issues
// @supportURL   https://www.nexusclash.com/viewtopic.php?f=8&t=0 not yet enabled
//
// @match        *://nexusclash.com/clash.php*
// @match        *://www.nexusclash.com/clash.php*
// @match        file:///*Nexus%20Clash*.html
// @icon         https://nexusclash.com/favicon.ico
// @grant        GM_setValue
// @grant        unsafeWindow
// @grant        GM.listValues
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
//
// @require      https://raw.githubusercontent.com/eligrey/FileSaver.js/master/dist/FileSaver.js
// @require      https://greasyfork.org/scripts/12228/code/setMutationHandler.js
// ==/UserScript==

const auto_import = false;

let NexMap = unsafeWindow.NexMap = {};
function RegisterFunctions() {
    NexMap.PrintRawData = function(regexp) { PrintRawData(regexp); };
    NexMap.PrintCharData = function(charname, ...flags) { PrintCharData(charname, ...flags); };
    NexMap.SaveCharData = function(charname, ...flags) { SaveCharData(charname, ...flags); };

    NexMap.PrintData = function(...flags) { PrintData(...flags); };
    NexMap.SaveData = function(...flags) { SaveData(...flags); };

    NexMap.ExportData = function(charname) { ExportData(charname); };
    NexMap.ImportData = function(charname) { ImportData(charname); };
    NexMap.ImportFile = function(filename, charname) { ImportFile(filename, charname); };

    NexMap.ClearData = function() { ClearData(); }
    NexMap.ClearValues = function(regexp) { ClearValues(regexp); };
    NexMap.DeleteValue = function(id) { DeleteValue(id); };
}

function RGBToHex(rgb) {
  // Turn "rgb(r,g,b)" into [r,g,b]
  rgb = rgb.substr(4).split(")")[0].split(",");

  let r = (+rgb[0]).toString(16),
      g = (+rgb[1]).toString(16),
      b = (+rgb[2]).toString(16);

  if (r.length == 1) r = "0" + r;
  if (g.length == 1) g = "0" + g;
  if (b.length == 1) b = "0" + b;

  return "#" + r + g + b;
}

function MatchRegexp(text, str_regexp) {
    return MatchAny(text, str_regexp);
}
function MatchAny(text, ...str_regexps) {
    var match = null;
    for (let str_regexp of str_regexps) {
        if (match != null) break;
        match = RegExp(str_regexp).exec(text);
    }
    return match;
}
const re_name = String.raw`[\w '&,\.-]+`;
const re_coords = String.raw`(?<x>\d+), (?<y>\d+)`; // puls two coordinates named x and y
const re_unnamed_coords = String.raw`(\d+) (\d+)` // pulls two unnamed coordinates

function GetCharName() { return document.querySelector("#CharacterInfo a[href^='clash.php?op=character&id=']").textContent.replace("/", ""); }
function GetCharFaction() {
    if (!document.querySelector("#CharacterInfo a[href^='clash.php?op=faction&do=view&id=']")) return null;
    return document.querySelector("#CharacterInfo a[href^='clash.php?op=faction&do=view&id=']").textContent;
}

async function GatherData(read_map) {
    const area_desc = document.getElementById("AreaDescription");
    if (area_desc == null) return;
    const utime = parseInt(Date.now() / 1000);

    const charname = GetCharName();
    const faction = GetCharFaction();

    const Store = function(id, value) { GM.setValue(`${charname}/${id}`, `[${utime}]${value}`); }
    const Clear = function(id) { GM.deleteValue(`${charname}/${id}`); }
    const Data = async function(id) { return await GM.getValue(`${charname}/${id}`); }

    const full_location = area_desc.getElementsByTagName("b")[0];
    const {name, x, y, plane} = MatchRegexp(full_location.childNodes[0].textContent, String.raw`(?<name>${re_name}) \(${re_coords} (?<plane>${re_name}), an? `).groups;
    const {neighborhood} = MatchRegexp(full_location.childNodes[2].textContent, String.raw`, Neighborhood: (?<neighborhood>${re_name})\)`).groups;
    const location_type = full_location.childNodes[1].textContent;

    // Map Tiles
    if (read_map) {
        const ingame_map = document.getElementById("Map");
        if (ingame_map != null) { // Map Tiles
            const map_tiles = ingame_map.getElementsByClassName("TableCell");
            for (let map_tile of map_tiles) {
                if (map_tile.title == undefined) continue;
                if (map_tile.title == "Unknown") continue;

                let map_tile_match = MatchRegexp(map_tile.title, String.raw`\(${re_coords}\) (?<tile_name>${re_name}), an? (?<tile_type>${re_name})`);
                if (map_tile_match == null) {
                    console.log("Error triggered by: " + map_tile.title);
                    continue;
                }
                const {x, y, tile_name, tile_type} = map_tile_match.groups;
                const background = RGBToHex(map_tile.style.backgroundColor);

                Store(`tiles/names/${plane}/(${x},${y})`, tile_name);
                Store(`tiles/types/${plane}/(${x},${y})`, tile_type);
                Store(`tiles/data/${plane}/(${x},${y})`, map_tile.title);
                Store(`background/${tile_type}`, background);

                const infusion_match = MatchRegexp(map_tile.style.backgroundImage, String.raw`.*infusion-(?<alignment>\w+)\.gif.*`);
                if (infusion_match != null) {
                    const alignment = infusion_match.groups.alignment.charAt(0).toUpperCase() + infusion_match.groups.alignment.slice(1);
                    const prev_alignment = await Data(`infusion/alignment/${plane}/(${x},${y})`);
                    if (prev_alignment == undefined || prev_alignment != alignment) {
                        // If a tile had its infusion alignment changed, assume its depth changed as well
                        Clear(`infusion/depth/${plane}/(${x},${y})`);
                        Store(`infusion/alignment/${plane}/(${x},${y})`, alignment);
                    }
                }

                const portal_match = MatchRegexp(map_tile.style.backgroundImage, String.raw`.*portal\.gif.*`);
                const main_desc = area_desc.getElementsByClassName("mainDescArea")[0].childNodes[0].textContent;
                const side = MatchRegexp(main_desc, String.raw`You are standing (?<side>\w+) .*`).groups.side;
                if (portal_match != null) {
                    const portal_found = await Data(`portals/${plane}/(${x},${y})/${side}/1`);
                    if (!portal_found) {
                        Store(`portals/${plane}/(${x},${y})/${side}/1`, "Unknown Destination");
                    }
                }
            }
        }
    }

    // Portals
    const forms = document.getElementById("main-left").getElementsByTagName("form");
    for (let form of forms) {
        if (form.name == "portal") {
            const main_desc = area_desc.getElementsByClassName("mainDescArea")[0].childNodes[0].textContent;
            const side = MatchRegexp(main_desc, String.raw`You are standing (?<side>\w+) .*`).groups.side;
            const inputs = form.getElementsByTagName("input");
            let counter = 1;
            for (let input of inputs) {
                if (input.type == "submit") {
                    const identifier = `portals/${plane}/(${x},${y})/${side}/${counter}`;
                    let match = MatchRegexp(input.value, String.raw`.* to (?<dest>.*)`);
                    let value = undefined;
                    if (match != undefined) value = match.groups.dest;
                    else value = `Unknown Destination (${input.value})`;
                    Store(identifier, value);
                    counter += 1;
                }
            }
        }
    }

    // Infusion
    const area_infusion = area_desc.getElementsByClassName("infusionArea")[0];
    if (area_infusion != null) {
        let {alignment, depth} = MatchRegexp(area_infusion.textContent, String.raw`This location is infused and aligned to the forces of (?<alignment>Good|Evil|Moral Freedom) to a depth of (?<depth>\d+) points.`).groups;
        if (alignment == "Moral Freedom") alignment = "Unaligned"
        Store(`infusion/alignment/${plane}/(${x},${y})`, alignment);
        Store(`infusion/depth/${plane}/(${x},${y})`, depth);
    }
}

async function GetData(charname, preserve_timestamp) {
    const list_values_ids = await GM.listValues();
    let tiledata = {}, backgrounds = {}, infusion = {}, portals = {};
    const Data = async function(id) { if (preserve_timestamp) { return await GM.getValue(id); } else { return (await GM.getValue(id)).replace(/\[\d+\]/, ""); } }

    const re_disc = function(disc) { return `(?<disc>${disc})`; }
    for (let value_id of list_values_ids) {
        const match = MatchAny(value_id,
		                       String.raw`(?<char>${re_name})/${re_disc("tiles")}/(?<disc2>\w+)/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))`,
		                       String.raw`(?<char>${re_name})/${re_disc("background")}/(?<tiletype>${re_name})`,
		                       String.raw`(?<char>${re_name})/${re_disc("infusion")}/(?<disc2>\w+)/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))`,
                               String.raw`(?<char>${re_name})/${re_disc("portals")}/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))/(?<side>\w+)/(?<counter>\d+)`,
                               String.raw`${re_disc("alert")}/.*`
                               );
        if (match == null) {
            console.log('"' + value_id + '"');
            continue;
        }
        if (match.groups.disc == "alert") continue;
        const {char, disc, disc2, plane, coords, tiletype, side, counter} = match.groups;
        if (charname != null && char != charname) continue;

        if (plane != null && !(plane in tiledata)) {
            tiledata[plane] = {names: {}, types: {}, data: {}};
            infusion[plane] = {depth: {}, alignment: {}};
            portals[plane] = {};
        }

        if (((disc == "tiles" || disc == "infusion" || disc == "portal") && (plane == undefined || coords == undefined)) || (disc == "background" && tiletype == undefined) || (disc == "portal" && (side == undefined || counter == undefined))) {
            GM.deleteValue(value_id);
            continue;
        }

        if (disc == "tiles") tiledata[plane][disc2][coords] = await Data(value_id);
        if (disc == "background") backgrounds[tiletype] = await Data(value_id);
        if (disc == "infusion") infusion[plane][disc2][coords] = await Data(value_id);
        if (disc == "portals") {
            if (portals[plane][coords] == undefined) portals[plane][coords] = {};
            if (portals[plane][coords][side] == undefined) portals[plane][coords][side] = {};
            portals[plane][coords][side][counter] = await Data(value_id);
        }
    }

    return {tiledata, backgrounds, infusion, portals};
}

async function PrintRawData(regexp) {
    let list_values_ids = await GM.listValues();
    let data = [];
    for (let value_id of list_values_ids) {
        if (!regexp || regexp.exec(value_id)) data.push(`${value_id}: ${await GM.getValue(value_id)}`);
    }
    data.sort();
    for (let line of data) console.log(line);
}

async function PrintCharData(charname, print_tiles, print_backgrounds, print_infusion, print_portals) {
    const {tiledata, backgrounds, infusion, portals} = await GetData(charname);

    const tab = "    ";
    if (print_tiles) {
        console.log("# Tiles");
        for (let plane in tiledata) {
            console.log(plane.replace(" ", "_") + " = {");
            for (let dict in tiledata[plane]) {
                console.log(tab + "\"" + dict + "\" = {");
                for (let tile in tiledata[plane][dict]) console.log(tab + tab + `${tile}: "${tiledata[plane][dict][tile]}",`);
                console.log(tab + "},");
            }
            console.log("}");
        }
    }
    if (print_backgrounds) {
        console.log("# Backgrounds");
        console.log("background_colors = {");
        for (let tiletype in backgrounds) console.log(tab + `"${tiletype}": "${backgrounds[tiletype]}",`);
        console.log("}");
    }
    if (print_infusion) {
        console.log("# Infusion");
        for (let plane in infusion) {
            console.log(plane.replace(" ", "_") + " = {");
            console.log(tab + "\"Infusion\" = {");
            for (let tile in infusion[plane].depth) console.log(tab + tab + `${tile}: "${infusion[plane].depth[tile]} ${infusion[plane].alignment[tile].charAt(0)}",`);
            console.log(tab + "},");
            for (let dict in infusion[plane]) {
                console.log(tab + "\"" + dict + "\" = {");
                for (let tile in infusion[plane][dict]) console.log(tab + tab + `${tile}: "${infusion[plane][dict][tile]}",`);
                console.log(tab + "},");
            }
            console.log("}");
        }
    }
    if (print_portals) {
        console.log("# Portals");
        for (let plane in infusion) {
            console.log(plane.replace(" ", "_") + " = {");
            for (let coords in portals[plane]) {
                console.log(tab + coords + " = {");
                if ("inside" in portals[plane][coords]) {
                    console.log(tab + tab + "Inside: [");
                    for (let portal in portals[plane][coords].inside) console.log(tab + tab + tab + `"${portals[plane][coords].inside[portal]}",`);
                    console.log(tab + tab + "],");
                }
                if ("outside" in portals[plane][coords]) {
                    console.log(tab + tab + "Outside: [");
                    for (let portal in portals[plane][coords].outside) console.log(tab + tab + tab + `"${portals[plane][coords].outside[portal]}",`);
                    console.log(tab + tab + "],");
                }
                console.log(tab + "}");
            }
            console.log("}");
        }
    }
}

function PrintData(print_tiles, print_backgrounds, print_infusion, print_portals) {
    const charname = GetCharName();
    PrintCharData(charname, print_tiles, print_backgrounds, print_infusion, print_portals);
}

function SaveLinesToFile(text_array, filename) {
    const blob = new Blob(
        text_array.map(str => str + "\n"),
        {type: "text/plain;charset=utf-8"}
    );
    saveAs(blob, filename);
}

async function SaveCharData(charname, save_tiles, save_backgrounds, save_infusion, save_portals) {
    const {tiledata, backgrounds, infusion, portals} = await GetData(charname);

    function tab(n) { return "    ".repeat(n); }
    if (save_tiles) {
        let text = [];
        for (let plane in tiledata) {
            text.push(plane.replace(" ", "_") + " = {");
            for (let dict in tiledata[plane]) {
                text.push(tab(1) + "\"" + dict + "\": {");
                for (let tile in tiledata[plane][dict]) text.push(tab(2) + `${tile}: "${tiledata[plane][dict][tile]}",`);
                text.push(tab(1) + "},");
            }
            text.push("}");
        }
        SaveLinesToFile(text, "tile_data.py");
    }
    if (save_backgrounds) {
        let text = [];
        text.push("background_colors = {");
        for (let tiletype in backgrounds) text.push(tab(1) + `"${tiletype}": "${backgrounds[tiletype]}",`);
        text.push("}");
        SaveLinesToFile(text, "background_colors.py");
    }
    if (save_infusion) {
        let text = [];
        for (let plane in infusion) {
            text.push(plane.replace(" ", "_") + " = {");
            for (let dict in infusion[plane]) {
                text.push(tab(1) + "\"" + dict + "\": {");
                for (let tile in infusion[plane][dict]) text.push(tab(2) + `${tile}: "${infusion[plane][dict][tile]}",`);
                text.push(tab(1) + "},");
            }
            text.push("}");
        }
        SaveLinesToFile(text, "infusion_data.py");
    }
    if (save_portals) {
        let text = [];
        for (let plane in infusion) {
            text.push(plane.replace(" ", "_") + " = {");
            for (let coords in portals[plane]) {
                text.push(tab(1) + coords + ": {");
                if ("inside" in portals[plane][coords]) {
                    text.push(tab(2) + "Inside: [");
                    for (let portal in portals[plane][coords].inside) text.push(tab(3) + `"${portals[plane][coords].inside[portal]}",`);
                    text.push(tab(2) + "],");
                }
                if ("outside" in portals[plane][coords]) {
                    text.push(tab(2) + "Outside: [");
                    for (let portal in portals[plane][coords].outside) text.push(tab(3) + `"${portals[plane][coords].outside[portal]}",`);
                    text.push(tab(2) + "],");
                }
                text.push(tab(1) + "}");
            }
            text.push("}");
        }
        SaveLinesToFile(text, "portal_data.py");
    }
}

function SaveData(save_tiles, save_backgrounds, save_infusion, save_portals) {
    const charname = GetCharName();
    SaveCharData(charname, save_tiles, save_backgrounds, save_infusion, save_portals);
}

async function ExportData(charname, filters) {
    console.log(charname);
    if (charname == undefined) charname = GetCharName();
    let list_values_ids = await GM.listValues();
    let data = [];
    for (let value_id of list_values_ids) {
        const match = MatchRegexp(value_id, String.raw`(?<char>[^/]+)/(?<id>.*)`);
        if (match != null && match.groups.char == charname) {
            if (!filters || MatchAny(match.groups.id, ...filters)) {
                data.push(`${match.groups.id}: ${await GM.getValue(value_id)}`);
            }
        }
    }
    data.sort();
    SaveLinesToFile(data, `${charname}.NexMap`);
}

async function ImportArray(import_array, charname) {let count_imports = 0, count_depth_deletes = 0;
    const re_timestamp = String.raw`\[(?<timestamp>\d+)\]`;
    for (let element of import_array) {
        const {id, timestamp, data} = MatchRegexp(element, String.raw`^(?<id>.*): ${re_timestamp}(?<data>.*)$`).groups;
        const local_element = await GM.getValue(`${charname}/${id}`);
        if (local_element == undefined) {
            count_imports += 1;
            GM.setValue(`${charname}/${id}`, `[${timestamp}]${data}`);
        }
        else {
            const local_timestamp = MatchRegexp(local_element, String.raw`^${re_timestamp}.*$`).groups.timestamp;
            if (local_timestamp < timestamp) {
                count_imports += 1;
                GM.setValue(`${charname}/${id}`, `[${timestamp}]${data}`);
                const inf_align_match = MatchRegexp(id, String.raw`infusion/alignment/(?<id_right>.*)`);
                if (inf_align_match) {
                    count_depth_deletes += 1;
                    GM.deleteValue(`${charname}/infusion/depth/${inf_align_match.groups.id_right}`);
                }
            }
        }
    }
    console.log(`Imported ${count_imports} values, and cleared ${count_depth_deletes} infusion depths as side-effect.`);
}

function ImportData(charname) {
    const import_array = document.body.textContent.split("\n").slice(0, -1);
    ImportArray(import_array, charname);
}

function ImportFile(file, charname) {
    if (!file) {
        alert("No file selected!");
        return;
    }

    if (charname === undefined) charname = GetCharName();

    var reader = new FileReader();
    reader.onload = function() { ImportArray(reader.result.split("\n").slice(0,-1), charname); }
    reader.readAsText(file);
}

async function ClearData() {
    let list_values_ids = await GM.listValues();
    let count = 0;
    for (let value_id of list_values_ids) {
        count += 1;
        GM.deleteValue(value_id);
    }
    console.log(`Deleted ${count} values from GM storage.`);
}

async function ClearValues(regexp) {
    let list_values_ids = await GM.listValues();
    let count = 0;
    for (let value_id of list_values_ids) {
        if (regexp.exec(value_id)) {
            count += 1;
            GM.deleteValue(value_id);
        }
    }
    console.log(`Deleted ${count} values from GM storage.`);
}

async function DeleteValue(id) {
    GM.deleteValue(id);
}

function GetTabName() {
    // check if tab is Game
    if (document.getElementById("CharacterInfo")) {
        if (document.getElementById("Map")) return "Game - Map";
        if (document.getElementById("inventory")) return "Game - Inventory";
        if (document.getElementById("PadForm")) return "Game - Pad";
        if (document.getElementById("NexusMapper")) return "Game - NexusMapper";
        return "Game - ?"; // Either board or weapons pane, didn't find an id to distinguish them
    }
    const match = MatchAny(unsafeWindow.location.search, String.raw`\?op=(?<op>character).*`, String.raw`\?op=(?<op>faction).*`, String.raw`\?op=(?<op>map).*`);
    if (match) return match.groups.op.charAt(0).toUpperCase() + match.groups.op.slice(1);
    if (unsafeWindow.location.origin == "https://www.nexusclash.com") return "Character Selection";

    return "Game - Map";
    return "???";
}

function NMSubtabUI() {
    // Remove Pad if present
    if (document.getElementById("main-right").children[0].children[0].children[3]) document.getElementById("main-right").children[0].children[0].children[3].children[0].innerHTML = "";
    // Remove Nexus Tweaks settings if present
    if (document.getElementById("main-right").children[0].children[1]) document.getElementById("main-right").children[0].children[1].innerHTML = "";

    const right_menu_content = document.getElementById("main-right").children[0].children[0].children[2].children[0];
    right_menu_content.replaceChildren();

    // Table creation
    const NM_div = right_menu_content.appendChild(document.createElement('div'));
    NM_div.id = "NexusMapper";
    const NM_content_table = NM_div.appendChild(document.createElement('table'));

    // Table Header
    const NM_content_theader = NM_content_table.appendChild(document.createElement('th'));
    NM_content_theader.colSpan = "2";
    NM_content_theader.style.backgroundColor = "#ffffff";
    NM_content_theader.style.fontWeight = "bold";
    NM_content_theader.style.textAlign = "center";
    NM_content_theader.textContent = "NEXUS MAPPER";

    // Table Content
    const NM_content_tbody = NM_content_table.appendChild(document.createElement('tbody'));
    let current_row = null;
    const widespace = true;
    const add_widespace = function(bg) {
        current_row = NM_content_tbody.appendChild(document.createElement('tr'));
        current_row.appendChild(document.createElement('td')).textContent = "\u00a0";
        current_row.appendChild(document.createElement('td')).textContent = "\u00a0";
        current_row.style.backgroundColor = bg;
    }

    // Row Group - Share Data
    current_row = NM_content_tbody.appendChild(document.createElement('tr'));
    let export_settings = current_row.appendChild(document.createElement('td'));
    export_settings.textContent = "Export settings will go here";
    let import_filename = current_row.appendChild(document.createElement('td'));
    import_filename.textContent = "No file selected";current_row.style.backgroundColor = "#ffffff";

    current_row = NM_content_tbody.appendChild(document.createElement('tr'));
    let share_infusion = current_row.appendChild(document.createElement('td'));
    share_infusion.innerHTML = '<input type="button" value="Export Mapper infusion data"/>';
    share_infusion.onclick = function() { ExportData(GetCharName(), ["infusion/.*"]); };
    let select_file_button = current_row.appendChild(document.createElement('td'));
    select_file_button.innerHTML =
        '<input type="file" id="importFile" accept=".NexMap" style="display:none;"/>' +
        '<input type="button" value="Select File..."/>';
    select_file_button.children[0].onchange = function() { import_filename.textContent = "FILE: " + select_file_button.children[0].files[0].name; };
    select_file_button.children[1].onclick = function() { document.getElementById('importFile').click(); };
    current_row.style.backgroundColor = "#ffffff";

    current_row = NM_content_tbody.appendChild(document.createElement('tr'));
    let share_data = current_row.appendChild(document.createElement('td'));
    share_data.innerHTML = '<input type="button" value="Export full Mapper data"/>';
    share_data.onclick = function() { ExportData(); };
    let import_button = current_row.appendChild(document.createElement('td'));
    import_button.innerHTML = '<input type="button" value="Import Mapper data"/>';
    import_button.onclick = function() { ImportFile(document.getElementById('importFile').files[0]); };
    current_row.style.backgroundColor = "#ffffff";

    if (widespace) add_widespace("#ffffff");

    // Row Group - Python Export
    current_row = NM_content_tbody.appendChild(document.createElement('tr'));
    let export_tiles = current_row.appendChild(document.createElement('td'));
    export_tiles.innerHTML = '<input type="button" value="Export tile data (.py)"/>';
    export_tiles.onclick = function() { SaveData(1,0,0,0); };
    let export_backgrounds = current_row.appendChild(document.createElement('td'));
    export_backgrounds.innerHTML = '<input type="button" value="Export backgrounds data (.py)"/>';
    export_backgrounds.onclick = function() { SaveData(0,1,0,0); };
    current_row.style.backgroundColor = "#eeeeee";

    current_row = NM_content_tbody.appendChild(document.createElement('tr'));
    let export_infusion = current_row.appendChild(document.createElement('td'));
    export_infusion.innerHTML = '<input type="button" value="Export infusion data (.py)"/>';
    export_infusion.onclick = function() { SaveData(0,0,1,0); };
    let export_portals = current_row.appendChild(document.createElement('td'));
    export_portals.innerHTML = '<input type="button" value="Export portal data (.py)"/>';
    export_portals.onclick = function() { SaveData(0,0,0,1); };
    current_row.style.backgroundColor = "#eeeeee";

    if (widespace) add_widespace("#eeeeee");
}

function IngameSidebarUI(is_NMsubtab) {
    const menu_TR = document.getElementById("sidebar-menu").firstChild.firstChild;
    const NMsubtab_button = document.createElement('td');
    NMsubtab_button.innerHTML = '<input class="sidebar_menu" type="button" value="Nexus Mapper"/>';
    NMsubtab_button.onclick = function() { NMSubtabUI(); };
    menu_TR.appendChild(NMsubtab_button);
}

async function GetCharNamesFromData() {
    const list_values_ids = await GM.listValues();
    let list_chars = []

    for (let value_id of list_values_ids) {
        const match = MatchRegexp(value_id, String.raw`(?<char>${re_name})/.*`);
        if (!match) continue;
        const char = match.groups.char;
        if (char == "alert") continue;
        if (!list_chars.includes(char)) list_chars.push(char);
    }

    return list_chars;
}

async function EnhancedIngameMapUI() {
    const ingame_map = document.getElementById("Map").children[0].children[0];
    let map_tiles = [];
    for (let i = 0; i < 5; i++) {
        map_tiles.push([]);
        for (let j = 0; j < 5; j++) {
            map_tiles[i].push(ingame_map.children[i].children[j]);
        }
    }
    const area_desc = document.getElementById("AreaDescription");
    if (area_desc == null) return;

    const charname = GetCharName();
    const {plane} = MatchRegexp(area_desc.getElementsByTagName("b")[0].childNodes[0].textContent, String.raw`(?<name>${re_name}) \(${re_coords} (?<plane>${re_name}), an? `).groups;
    const preserve_timestamp = false;
    const Data = async function(id) { if (preserve_timestamp) { return await GM.getValue(`${charname}/${id}`); } else { let data = await GM.getValue(`${charname}/${id}`); if (!data) return data; return data.replace(/\[\d+\]/, ""); } }
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const map_tile = map_tiles[i][j];
            if (map_tile.title == undefined) continue;
            if (map_tile.title == "Unknown") continue;
            const match = MatchRegexp(map_tile.title, String.raw`\(${re_coords}\) (?<tile_name>${re_name}), an? (?<tile_type>${re_name})`);
            if (!match) {
                console.log("[EnhancedIngameMapUI] Error with tilename: ", map_tile.title);
                continue;
            }
            let {x, y} = match.groups;
            const infusion_alignment = await Data(`infusion/alignment/${plane}/(${x},${y})`);
            const infusion_depth = await Data(`infusion/depth/${plane}/(${x},${y})`);
            if (infusion_alignment) {
                if (!MatchRegexp(map_tile.style.backgroundImage, String.raw`images/g/inf/infusion-.*\.gif`)) {
                    if (map_tile.style.backgroundImage) map_tile.style.backgroundImage = `url('images/g/inf/infusion-${infusion_alignment.charAt(0).toLowerCase() + infusion_alignment.slice(1)}.gif'), ` + map_tile.style.backgroundImage;
                    else map_tile.style.backgroundImage = `url('images/g/inf/infusion-${infusion_alignment.charAt(0).toLowerCase() + infusion_alignment.slice(1)}.gif')`;
                    if (infusion_depth) {
                        const tileTable = document.createElement('table');
                        let middleElement = map_tile.firstChild;
                        let infElement = document.createElement('td');
                        infElement.textContent = `\u00a0${infusion_depth} ${infusion_alignment.charAt(0)}`;
                        infElement.style.textAlign = "left";
                        if (!middleElement) {
                            map_tile.appendChild(tileTable);
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(document.createElement('br'));
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(document.createElement('br'));
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(infElement);
                        } else {
                            map_tile.replaceChild(tileTable, middleElement);
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(document.createElement('br'));
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(document.createElement('td'));
                            tileTable.lastChild.lastChild.appendChild(middleElement);
                            tileTable.appendChild(document.createElement('tr'));
                            tileTable.lastChild.appendChild(infElement);
                        }
                    }
                }
            }
        }
    }
    console.log("bawk");
}

function DrawInfusion(canvas_ctx, x, y, xf, yf, color, D) {
    const X = (x - unsafeWindow.mapDim[unsafeWindow.cur_plane].x_offset) * 24;
    const Y = (y - unsafeWindow.mapDim[unsafeWindow.cur_plane].y_offset) * 24;

    canvas_ctx.fillStyle = color;
    canvas_ctx.fillRect(X*xf, Y*yf, 6*xf, 23*yf);
    canvas_ctx.strokeStyle = 'black';
    canvas_ctx.strokeRect(X*xf, Y*yf, 6*xf, 23*yf);

    if (D > -1) {
        canvas_ctx.font = "16px Arial";
        canvas_ctx.fillText(D, 10 + X*xf, 17 + Y*yf);
    }
}

async function EnhancedGlobalMapUI() {
    const map_buttons_div = document.getElementById('navbarsExample08');
    const char_list = await GetCharNamesFromData();
    const char_dropdown_div = map_buttons_div.appendChild(document.createElement('div'));
    const char_dropdown_label = char_dropdown_div.appendChild(document.createElement('div'));
    char_dropdown_label.textContent = "Display infusion data for:";
    const char_dropdown = char_dropdown_div.appendChild(document.createElement('select'));
    char_dropdown.name = "Character Name";
    char_dropdown.id = "charname";
    let charname = "";
    let infusion = {};
    char_dropdown.onchange = async function() { charname = char_dropdown.value; infusion = (await GetData(charname, false)).infusion; map_buttons_div.click(); };
    const no_char = char_dropdown.appendChild(document.createElement('option'));
    no_char.value = "";
    no_char.textContent = "---";
    for (let char of char_list) {
        const char_option = char_dropdown.appendChild(document.createElement('option'));
        char_option.value = char;
        char_option.textContent = char;
    }

    map_buttons_div.onclick = function() {
        if (!charname) return;
        const canvas = document.getElementById('map');
        const plane = {
            406: "Cordillera",
            416: "Centrum",
            402: "Elysium",
            403: "Stygia",
            404: "Purgatorio",
            405: "Purgatorio",
        }[unsafeWindow.cur_plane];
        let tile_alignment = {};
        let tile_inf_depth = {};

        setMutationHandler({
            target: document.querySelector('div.content'),
            selector: '#tooltip',
            handler: nodes => nodes.forEach(node => {
                const match = MatchRegexp(node.textContent, String.raw`^\(${re_coords}\).+`)
                if (!match) return

                const {x,y} = match.groups
                const coords = `(${x},${y})`
                if (!(coords in tile_inf_depth)) return

                node.textContent = `${tile_inf_depth[coords]}${tile_alignment[coords].charAt(0)} ` + node.textContent
            })
        });
        if (plane in infusion) {
            tile_alignment = infusion[plane].alignment
            tile_inf_depth = infusion[plane].depth
        };

        let xf = 1, yf = 1;
        if (canvas.style.width) xf = canvas.width / canvas.style.width.slice(0,-2);
        if (canvas.style.height) yf = canvas.height / canvas.style.height.slice(0,-2);

        if (canvas.getContext) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let coords in tile_alignment) {
                const {x, y} = MatchRegexp(coords, String.raw`\((?<x>\d+),(?<y>\d+)\)`).groups;
                const color = {
                    Good:      "#00FFFF",
                    Unaligned: "#FFD700",
                    Evil:      "#BB0A1E",
                }[tile_alignment[coords]];
                let D = -1;
                if (coords in tile_inf_depth) D = Math.floor(tile_inf_depth[coords] / 50);
                DrawInfusion(ctx, x, y, xf, yf, color, D);
            }
        }
    };
    map_buttons_div.click();
}

async function DevAlert(version) {
    if (!await GM.getValue(`alert/${version}`)) {
        alert(`You're running an unstable version of Nexus Mapper.\nCaution is advised.\nVersion: ${version}`);
        GM.setValue(`alert/${version}`, true);
    }
}

function main() {
    const version = GM.info.script.version;
    if (MatchRegexp(version, String.raw`.*\.dev\..*`)) DevAlert(version);

    const tab = GetTabName();
    // console.log("Tab: " + tab);

    if (MatchRegexp(tab, "Game.*")) {
        GatherData(tab == "Game - Map");
        if (tab == "Game - Map") EnhancedIngameMapUI();
        IngameSidebarUI();
    }
    else if (tab == "Map") EnhancedGlobalMapUI();

    RegisterFunctions();
}

main();
