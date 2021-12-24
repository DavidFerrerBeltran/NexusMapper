// ==UserScript==
// @name         Nexus Mapper
// @version      1.0.1
// @author       Goliath
// @description  Mapping tool for NC
// @namespace    https://github.com/DavidFerrerBeltran/
// @homepage     https://github.com/DavidFerrerBeltran/NexusMapper
// @source       https://github.com/DavidFerrerBeltran/NexusMapper
// @match        *://nexusclash.com/clash.php*
// @match        *://www.nexusclash.com/clash.php*
// @icon         https://www.google.com/s2/favicons?domain=nexusclash.com
// @grant        GM.listValues
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// ==/UserScript==

const mapping = true;
const gather_infusion = true;
const gather_data = mapping || gather_infusion;

let NexMap = unsafeWindow.NexMap = {};

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

function match_regex(text, regex) {
    return match_any(text, regex);
}

function match_any(text, ...regexes) {
    var match = null;
    for (let regex of regexes) {
        if (match != null) break;
        match = RegExp(regex).exec(text);
    }
    return match;
}

const re_name = String.raw`[\w '&,]+`;
const re_coords = String.raw`(?<x>\d+), (?<y>\d+)`;

function GatherData() {
    const area_desc = document.getElementById("AreaDescription");
    if (area_desc == null) return;

    const full_location = area_desc.getElementsByTagName("b")[0];
    const {name, x, y, plane} = match_regex(full_location.childNodes[0].textContent, String.raw`(?<name>${re_name}) \(${re_coords} (?<plane>${re_name}), an? `).groups;
    const {neighborhood} = match_regex(full_location.childNodes[2].textContent, String.raw`, Neighborhood: (?<neighborhood>${re_name})\)`).groups;
    const location_type = full_location.childNodes[1].textContent;

    if (mapping) {
        let portal = null;
        const forms = document.getElementById("main-left").getElementsByTagName("form");
        for (let form of forms) {
            if (form.name == "portal") {
                const main_desc = area_desc.getElementsByClassName("mainDescArea")[0].childNodes[0].textContent;
                const side = match_regex(main_desc, String.raw`You are standing (?<side>\w+) .*`).groups.side;
                const inputs = form.getElementsByTagName("input");
                let counter = 1;
                for (let input of inputs) {
                    if (input.type == "submit") {
                        const identifier = `portals/${plane}/(${x},${y})/${side}/${counter}`;
                        let match = match_regex(input.value, String.raw`.* to (?<dest>.*)`);
                        let value = undefined;
                        if (match != undefined) value = match.groups.dest;
                        else value = `Unknown Destination (${input.value})`;
                        GM.setValue(identifier, value);
                        counter += 1;
                    }
                }
            }
        }

        const ingame_map = document.getElementById("Map");
        if (ingame_map != null) {
            const map_tiles = ingame_map.getElementsByClassName("TableCell");
            for (let map_tile of map_tiles) {
                if (map_tile.title == undefined) continue;
                if (map_tile.title == "Unknown") continue;

                let map_tile_match = match_regex(map_tile.title, String.raw`\(${re_coords}\) (?<tile_name>${re_name}), an? (?<tile_type>${re_name})`);
                if (map_tile_match == null) {
                    console.log("Error triggered by: " + map_tile.title);
                    continue;
                }
                const {x, y, tile_name, tile_type} = map_tile_match.groups;
                const background = RGBToHex(map_tile.style.backgroundColor);

                GM.setValue(`tiles/names/${plane}/(${x},${y})`, tile_name);
                GM.setValue(`tiles/types/${plane}/(${x},${y})`, tile_type);
                GM.setValue(`tiles/data/${plane}/(${x},${y})`, map_tile.title);
                GM.setValue(`background/${tile_type}`, background);
                const match = match_regex(map_tile.style.backgroundImage, String.raw`.*infusion-(?<alignment>\w+)\.gif.*`);
                if (match != null) {
                    const alignment = match.groups.alignment.charAt(0).toUpperCase() + match.groups.alignment.slice(1);
                    GM.setValue(`infusion/alignment/${plane}/(${x},${y})`, alignment);
                }
            }
        }
    }

    if (gather_infusion) {
        const area_infusion = area_desc.getElementsByClassName("infusionArea")[0];
        if (area_infusion != null) {
            const {alignment, depth} = match_regex(area_infusion.textContent, String.raw`This location is infused and aligned to the forces of (?<alignment>\w+) to a depth of (?<depth>\d+) points.`).groups;
            GM.setValue(`infusion/alignment/${plane}/(${x},${y})`, alignment);
            GM.setValue(`infusion/depth/${plane}/(${x},${y})`, depth);
        }
    }
}

async function PrintData(print_tiles, print_backgrounds, print_infusion, print_portals) {
    let list_values_ids = await GM.listValues();
    let tiledata = {}, backgrounds = {}, infusion = {}, portals = {};

    for (let value_id of list_values_ids) {
        let match = match_any(value_id,
		                        String.raw`(?<disc>tiles)\/(?<disc2>\w+)\/(?<plane>${re_name})\/(?<coords>\(\d+,\d+\))`,
		                        String.raw`(?<disc>background)\/(?<tiletype>${re_name})`,
		                        String.raw`(?<disc>infusion)\/(?<disc2>\w+)\/(?<plane>${re_name})\/(?<coords>\(\d+,\d+\))`,
		                        String.raw`(?<disc>portals)\/(?<plane>${re_name})\/(?<coords>\(\d+,\d+\))\/(?<side>\w+)\/(?<counter>\d+)`
                               );
        if (match == null) {
            console.log('"' + value_id + '"');
            continue;
        }
        const {disc, disc2, plane, coords, tiletype, side, counter} = match.groups;
        if (plane != null && !(plane in tiledata)) {
            tiledata[plane] = {names: {}, types: {}, data: {}};
            infusion[plane] = {depth: {}, alignment: {}};
            portals[plane] = {};
        }

        if (((disc == "tiles" || disc == "infusion" || disc == "portal") && (plane == undefined || coords == undefined)) || (disc == "background" && tiletype == undefined) || (disc == "portal" && (side == undefined || counter == undefined))) {
            GM.deleteValue(value_id);
            continue;
        }

        if (disc == "tiles" && print_tiles) tiledata[plane][disc2][coords] = await GM.getValue(value_id);
        if (disc == "background" && print_backgrounds) backgrounds[tiletype] = await GM.getValue(value_id);
        if (disc == "infusion" && print_infusion) infusion[plane][disc2][coords] = await GM.getValue(value_id);
        if (disc == "portals" && print_portals) {
            if (portals[plane][coords] == undefined) portals[plane][coords] = {};
            if (portals[plane][coords][side] == undefined) portals[plane][coords][side] = {};
            portals[plane][coords][side][counter] = await GM.getValue(value_id);
        }
    }

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

async function ClearData() {
    let list_values_ids = await GM.listValues();
    let count = 0;
    for (let value_id of list_values_ids) {
        count += 1;
        GM.deleteValue(value_id);
    }
    console.log(`Deleted ${count} values from GM storage.`);
}

async function DeleteValue(id) {
    GM.deleteValue(id);
}

function main() {
    if (gather_data) GatherData();

    NexMap.PrintData = function(a, b, c, d) { PrintData(a, b, c, d); };
    NexMap.ClearData = function() { ClearData(); }
    NexMap.DeleteValue = function(id) { DeleteValue(id); };
}

main();
