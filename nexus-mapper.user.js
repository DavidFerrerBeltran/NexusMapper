// ==UserScript==
// @name         Nexus Mapper
// @version      2.dev.1
// @author       Goliath
// @description  Mapping tool for NC
// @namespace    https://github.com/DavidFerrerBeltran/
// @homepage     https://github.com/DavidFerrerBeltran/NexusMapper
// @source       https://github.com/DavidFerrerBeltran/NexusMapper
// @downloadURL  https://github.com/DavidFerrerBeltran/NexusMapper/raw/dev/nexus-mapper.user.js
// @match        *://nexusclash.com/clash.php*
// @match        *://www.nexusclash.com/clash.php*
// @match        file:///*Nexus%20Clash*.html
// @match        file:///*.NexMap.txt
// @icon         https://nexusclash.com/favicon.ico
// @grant        GM_setValue
// @grant        GM.listValues
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @require      https://raw.githubusercontent.com/eligrey/FileSaver.js/master/dist/FileSaver.js
// ==/UserScript==

const auto_import = false;

let NexMap = unsafeWindow.NexMap = {};
function RegisterFunctions() {
    NexMap.PrintRawData = function() { PrintRawData(); };
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
const re_name = String.raw`[\w '&,]+`;
const re_coords = String.raw`(?<x>\d+), (?<y>\d+)`; // puls two coordinates named x and y
const re_unnamed_coords = String.raw`(\d+) (\d+)` // pulls two unnamed coordinates

function GetCharName() { return document.querySelector("#CharacterInfo a[href^='clash.php?op=character&id=']").textContent; }
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
                const match = MatchRegexp(map_tile.style.backgroundImage, String.raw`.*infusion-(?<alignment>\w+)\.gif.*`);
                if (match != null) {
                    const alignment = match.groups.alignment.charAt(0).toUpperCase() + match.groups.alignment.slice(1);
                    const prev_alignment = await Data(`infusion/alignment/${plane}/(${x},${y})`);
                    if (prev_alignment != undefined && prev_alignment != alignment) {
                        // If a tile had its infusion alignment changed, assume its depth changed as well
                        Clear(`infusion/depth/${plane}/(${x},${y})`);
                        Store(`infusion/alignment/${plane}/(${x},${y})`, alignment);
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
        const {alignment, depth} = MatchRegexp(area_infusion.textContent, String.raw`This location is infused and aligned to the forces of (?<alignment>\w+) to a depth of (?<depth>\d+) points.`).groups;
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
                               String.raw`(?<char>${re_name})/${re_disc("portals")}/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))/(?<side>\w+)/(?<counter>\d+)`
                               );
        if (match == null) {
            console.log('"' + value_id + '"');
            continue;
        }
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

async function PrintRawData() {
    let list_values_ids = await GM.listValues();
    let data = [];
    for (let value_id of list_values_ids) data.push(`${value_id}: ${await GM.getValue(value_id)}`);
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
                text.push(tab(1) + "\"" + dict + "\" = {");
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
                text.push(tab(1) + "\"" + dict + "\" = {");
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
                text.push(tab(1) + coords + " = {");
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

async function ExportData(charname) {
    if (charname == undefined) charname = GetCharName();
    let list_values_ids = await GM.listValues();
    let data = [];
    for (let value_id of list_values_ids) {
        const match = MatchRegexp(value_id, String.raw`(?<char>${re_name})/(?<id>.*)`);
        if (match != null && match.groups.char == charname) data.push(`${match.groups.id}: ${await GM.getValue(value_id)}`);
    }
    data.sort();
    SaveLinesToFile(data, `${charname}.NexMap.txt`);
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
    if (MatchRegexp(unsafeWindow.location.origin, ".*nexusclash.com")) {
        if (document.getElementById("CharacterInfo")) {
            if (document.getElementById("Map")) return "Game - Map";
            if (document.getElementById("inventory")) return "Game - Inventory";
            if (document.getElementById("PadForm")) return "Game - Pad";
            if (document.getElementById("NexusMapper")) return "Game - NexusMapper";
            return "Game - ?"; // Either board or weapons pane, didn't find an id to distinguish them
        }
        const match = MatchAny(unsafeWindow.location.search, String.raw`\?op=(?<op>character).*`, String.raw`\?op=(?<op>faction).*`, String.raw`\?op=(?<op>map).*`);
        if (match) return match.groups.op.charAt(0).toUpperCase() + match.groups.op.slice(1);
    } else {
        if (MatchRegexp(unsafeWindow.location.pathname, String.raw`.*NexMap\.txt`)) return "Read html";
        if (MatchRegexp(unsafeWindow.location.pathname, String.raw`.*Clash.*\.html`)) return "Import data";
    }

    return "???";
}

NexMap.DisplayNMSubtab = function () {
    // Remove Pad if present
    if (document.getElementById("main-right").children[0].children[0].children[3]) document.getElementById("main-right").children[0].children[0].children[3].children[0].innerHTML = "";
    // Remove Nexus Tweaks settings if present
    if (document.getElementById("main-right").children[0].children[1]) document.getElementById("main-right").children[0].children[1].innerHTML = "";

    const right_menu_content = document.getElementById("main-right").children[0].children[0].children[2].children[0];
    right_menu_content.innerHTML =
        '<div id="NexusMapper">' +
        '<table>' +
        '<tbody>' +
        '<th colspan="6" align="center" style="text-align:center;font-weight:bold">NEXUS MAPPER</th>' +
        '<tr bgcolor="#eeeeee" style="text-align:center;font-weight:bold">' +
        '<td>Export</td>' +
        '<td>Import</td>' +
        '</tr>' +
        '<tr bgcolor="#ffffff">' +
        '<td>Exporting settigns will go here</td>' +
        '<td><label for="importFile" hidden>File to be imported:</label><input type="file" id="importFile" name="importFile" accept=".NexMap.txt"></td>' +
        '</tr>' +
        '<tr bgcolor="#ffffff">' +
        '<td><input type="button" value="Export" onclick="NexMap.ExportData()"></td>' +
        '<td><input type="button" value="Import" onclick="NexMap.ImportFile(document.getElementById(\'importFile\').files[0])"></td>' +
        '</tr>' +
        '</tbody>' +
        '</table>' +
        '</div>'
    ;
}
function SidebarUI(is_NMsubtab) {
    const menu_TR = document.getElementById("sidebar-menu").firstChild.firstChild;
    const NMsubtab_button = document.createElement('td');
    NMsubtab_button.innerHTML = '<input class="sidebar_menu" type="button" value="Nexus Mapper" onclick="NexMap.DisplayNMSubtab()">';
    menu_TR.appendChild(NMsubtab_button);
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
        SidebarUI();
    }
    else if (tab == "Import data") {
        const url = unsafeWindow.location.href.replace(/%20/g, " ");
        if (auto_import) ImportData(MatchRegexp(url, String.raw`file:///.*/(?<filename>.*?)\.NexMap\.txt`).groups.filename);
        else console.log("To import data manually, execute \"NexMap.ImportData(charname)\", where charname is a string with the name of the character that is receiving the data. Be careful with spelling and capitalization!");
    }

    RegisterFunctions();
}

main();
