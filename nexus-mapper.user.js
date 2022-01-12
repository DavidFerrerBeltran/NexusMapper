// ==UserScript==
// @name         Nexus Mapper
// @version      2.dev.10
// @author       Goliath
// @description  Mapping tool for NC
//
// @namespace    https://github.com/DavidFerrerBeltran/
// homepage     https://www.nexusclash.com/viewtopic.php?f=8&t=0
// @source       https://github.com/DavidFerrerBeltran/NexusMapper/tree/dev
//
// @updateURL    https://github.com/DavidFerrerBeltran/NexusMapper/raw/dev/nexus-mapper.user.js
// @supportURL   https://github.com/DavidFerrerBeltran/NexusMapper/Issues
// supportURL   https://www.nexusclash.com/viewtopic.php?f=8&t=0
//
// @match        *://nexusclash.com/clash.php*
// @match        *://www.nexusclash.com/clash.php*
// @match        file:///*Nexus%20Clash*.html
// @icon         https://nexusclash.com/favicon.ico
//
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

const auto_import = false
let settings = {}
let NexMap = unsafeWindow.NexMap = {}
function RegisterFunctions() {
    NexMap.PrintRawData = function(regexp) { PrintRawData(regexp)}
    NexMap.PrintCharData = function(charname, ...flags) { PrintCharData(charname, ...flags)}
    NexMap.SaveCharData = function(charname, ...flags) { SaveData(charname, ...flags)}

    NexMap.PrintData = function(...flags) { PrintData(...flags)}
    NexMap.SaveData = function(...flags) { SaveData(GetCharName(), ...flags)}

    NexMap.ExportData = function(charname) { ExportData(charname)}
    NexMap.ImportData = function(charname) { ImportData(charname)}
    NexMap.ImportFile = function(filename, charname) { ImportFile(filename, charname)}

    NexMap.ClearData = function() { ClearData()}
    NexMap.ClearValues = function(regexp) { ClearValues(regexp)}
    NexMap.DeleteValue = function(id) { DeleteValue(id)}
}

function RGBToHex(rgb) {
    // Turn "rgb(r,g,b)" into [r,g,b]
    rgb = rgb.substr(4).split(")")[0].split(",")

    let r = (+rgb[0]).toString(16),
        g = (+rgb[1]).toString(16),
        b = (+rgb[2]).toString(16)

    if (r.length == 1) r = "0" + r
    if (g.length == 1) g = "0" + g
    if (b.length == 1) b = "0" + b

    return "#" + r + g + b
}

function MatchRegexp(text, str_regexp) {
    return MatchAny(text, str_regexp)
}
function MatchAny(text, ...str_regexps) {
    var match = null
    for (let str_regexp of str_regexps) {
        if (match != null) break
        match = RegExp(str_regexp).exec(text)
    }
    return match
}
const re_name = String.raw`[\w '&,\.-]+`
const re_coords = String.raw`(?<x>\d+), (?<y>\d+)`; // puls two coordinates named x and y
const re_unnamed_coords = String.raw`(\d+) (\d+)` // pulls two unnamed coordinates

function GetCharName() { return document.querySelector("#CharacterInfo a[href^='clash.php?op=character&id=']").textContent.replace("/", "")}
function GetCharFaction() {
    if (!document.querySelector("#CharacterInfo a[href^='clash.php?op=faction&do=view&id=']")) return null
    return document.querySelector("#CharacterInfo a[href^='clash.php?op=faction&do=view&id=']").textContent
}

function GetSetting(setting) {
    const setting_id = GetCharName() + "/settings/" + setting
    return GM.getValue(setting_id)
}

async function GatherData(read_map) {
    const setting_names = ['gather/infusion', 'gather/portals', 'gather/tiletypes', 'gather/tilenames', 'gather/backgrounds']
    let setting_promises = []
    for (let sn of setting_names) setting_promises.push(GetSetting(sn).then(function(v) { settings[sn] = v }))
    await Promise.all(setting_promises)

    const area_desc = document.getElementById("AreaDescription")
    if (area_desc == null) return
    const utime = parseInt(Date.now() / 1000)

    const charname = GetCharName()
    const faction = GetCharFaction()

    const Store = function(id, value) { GM.setValue(`${charname}/${id}`, `[${utime}]${value}`)}
    const Clear = function(id) { GM.deleteValue(`${charname}/${id}`)}
    const Data = async function(id) { return await GM.getValue(`${charname}/${id}`)}

    const full_location = area_desc.getElementsByTagName("b")[0]
    const {name, x, y, plane} = MatchRegexp(full_location.childNodes[0].textContent, String.raw`(?<name>${re_name}) \(${re_coords} (?<plane>${re_name}), an? `).groups
    const {neighborhood} = MatchRegexp(full_location.childNodes[2].textContent, String.raw`, Neighborhood: (?<neighborhood>${re_name})\)`).groups
    const location_type = full_location.childNodes[1].textContent

    if (settings['gather/infusion']) {
        const area_infusion = area_desc.getElementsByClassName("infusionArea")[0]
        if (area_infusion != null) {
            let {alignment, depth} = MatchRegexp(area_infusion.textContent, String.raw`This location is infused and aligned to the forces of (?<alignment>Good|Evil|Moral Freedom) to a depth of (?<depth>\d+) points.`).groups
            if (alignment == "Moral Freedom") alignment = "Unaligned"
            Store(`infusion/alignment/${plane}/(${x},${y})`, alignment)
            Store(`infusion/depth/${plane}/(${x},${y})`, depth)
        }
    }

    if (settings['gather/portals']) {
        const forms = document.getElementById("main-left").getElementsByTagName("form")
        for (let form of forms) {
            if (form.name == "portal") {
                const main_desc = area_desc.getElementsByClassName("mainDescArea")[0].childNodes[0].textContent
                const side = MatchRegexp(main_desc, String.raw`You are standing (?<side>\w+) .*`).groups.side
                const inputs = form.getElementsByTagName("input")
                let counter = 1
                for (let input of inputs) {
                    if (input.type == "submit") {
                        const identifier = `portals/${plane}/(${x},${y})/${side}/${counter}`
                        let match = MatchRegexp(input.value, String.raw`.* to (?<dest>.*)`)
                        let value = undefined
                        if (match != undefined) value = match.groups.dest
                        else value = `Unknown Destination (${input.value})`
                        Store(identifier, value)
                        counter += 1
                    }
                }
            }
        }
    }

    // Map Tiles
    if (read_map) {
        const ingame_map = document.getElementById("Map")
        if (ingame_map != null) { // Map Tiles
            const map_tiles = ingame_map.getElementsByClassName("TableCell")
            for (let map_tile of map_tiles) {
                if (map_tile.title == undefined) continue
                if (map_tile.title == "Unknown") continue

                let map_tile_match = MatchRegexp(map_tile.title, String.raw`\(${re_coords}\) (?<tile_name>${re_name}), an? (?<tile_type>${re_name})`)
                if (map_tile_match == null) {
                    console.log("Error triggered by: " + map_tile.title)
                    continue
                }
                const {x, y, tile_name, tile_type} = map_tile_match.groups
                const background = RGBToHex(map_tile.style.backgroundColor)

                if (settings['gather/tilenames']) Store(`tiles/names/${plane}/(${x},${y})`, tile_name)
                if (settings['gather/tiletypes']) Store(`tiles/types/${plane}/(${x},${y})`, tile_type)
                if (settings['gather/tilenames']) Store(`tiles/data/${plane}/(${x},${y})`, map_tile.title)
                if (settings['gather/backgrounds']) Store(`background/${tile_type}`, background)

                if (settings['gather/infusion']) {
                    const infusion_match = MatchRegexp(map_tile.style.backgroundImage, String.raw`.*infusion-(?<alignment>\w+)\.gif.*`)
                    if (infusion_match != null) {
                        const alignment = infusion_match.groups.alignment.charAt(0).toUpperCase() + infusion_match.groups.alignment.slice(1)
                        const prev_alignment = await Data(`infusion/alignment/${plane}/(${x},${y})`)
                        if (prev_alignment == undefined || prev_alignment != alignment) {
                            // If a tile had its infusion alignment changed, assume its depth changed as well
                            Clear(`infusion/depth/${plane}/(${x},${y})`)
                            Store(`infusion/alignment/${plane}/(${x},${y})`, alignment)
                        }
                    }
                }

                if (settings['gather/portals']) {
                    const portal_match = MatchRegexp(map_tile.style.backgroundImage, String.raw`.*portal\.gif.*`)
                    const main_desc = area_desc.getElementsByClassName("mainDescArea")[0].childNodes[0].textContent
                    const side = MatchRegexp(main_desc, String.raw`You are standing (?<side>\w+) .*`).groups.side
                    if (portal_match != null) {
                        const portal_found = await Data(`portals/${plane}/(${x},${y})/${side}/1`)
                        if (!portal_found) {
                            Store(`portals/${plane}/(${x},${y})/${side}/1`, "Unknown Destination")
                        }
                    }
                }
            }
        }
    }
}

async function RetrieveData(charname, preserve_timestamp, ...filters) {
    const list_values_ids = await GM.listValues()
    let tiledata = {}, backgrounds = {}, infusion = {}, portals = {}
    const Data = async function(id) { if (preserve_timestamp) { return await GM.getValue(id)} else { return (await GM.getValue(id)).replace(/\[\d+\]/, "")} }

    const re_disc = function(disc) { return `(?<disc>${disc})`}
    for (let value_id of list_values_ids) {
        if (!filters) if (!MatchAny(value_id, ...filters)) continue
        const match = MatchAny(value_id,
		                       String.raw`(?<char>${re_name})/${re_disc("tiles")}/(?<disc2>\w+)/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))`,
		                       String.raw`(?<char>${re_name})/${re_disc("background")}/(?<tiletype>${re_name})`,
		                       String.raw`(?<char>${re_name})/${re_disc("infusion")}/(?<disc2>\w+)/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))`,
                               String.raw`(?<char>${re_name})/${re_disc("portals")}/(?<plane>${re_name})/(?<coords>\(\d+,\d+\))/(?<side>\w+)/(?<counter>\d+)`,
                               String.raw`${re_disc("alert")}/.*`
                               )
        if (match == null) {
            console.log('[RetrieveData] Error with value_id: "' + value_id + '"')
            continue
        }
        if (match.groups.disc == "alert") continue
        const {char, disc, disc2, plane, coords, tiletype, side, counter} = match.groups
        if (charname != null && char != charname) continue

        if (plane != null && !(plane in tiledata)) {
            tiledata[plane] = {names: {}, types: {}, data: {}}
            infusion[plane] = {depth: {}, alignment: {}}
            portals[plane] = {}
        }

        if (((disc == "tiles" || disc == "infusion" || disc == "portal") && (plane == undefined || coords == undefined)) || (disc == "background" && tiletype == undefined) || (disc == "portal" && (side == undefined || counter == undefined))) {
            GM.deleteValue(value_id)
            continue
        }

        if (disc == "tiles") tiledata[plane][disc2][coords] = await Data(value_id)
        if (disc == "background") backgrounds[tiletype] = await Data(value_id)
        if (disc == "infusion") infusion[plane][disc2][coords] = await Data(value_id)
        if (disc == "portals") {
            if (portals[plane][coords] == undefined) portals[plane][coords] = {}
            if (portals[plane][coords][side] == undefined) portals[plane][coords][side] = {}
            portals[plane][coords][side][counter] = await Data(value_id)
        }
    }

    return {tiledata, backgrounds, infusion, portals}
}

async function PrintRawData(regexp) {
    let list_values_ids = await GM.listValues()
    let data = []
    for (let value_id of list_values_ids) {
        if (!regexp || regexp.exec(value_id)) data.push(`${value_id}: ${await GM.getValue(value_id)}`)
    }
    data.sort()
    for (let line of data) console.log(line)
}

async function PrintCharData(charname, print_tiles, print_backgrounds, print_infusion, print_portals) {
    const {tiledata, backgrounds, infusion, portals} = await RetrieveData(charname)

    const tab = "    "
    if (print_tiles) {
        console.log("# Tiles")
        for (let plane in tiledata) {
            console.log(plane.replace(" ", "_") + " = {")
            for (let dict in tiledata[plane]) {
                console.log(tab + "\"" + dict + "\" = {")
                for (let tile in tiledata[plane][dict]) console.log(tab + tab + `${tile}: "${tiledata[plane][dict][tile]}",`)
                console.log(tab + "},")
            }
            console.log("}")
        }
    }
    if (print_backgrounds) {
        console.log("# Backgrounds")
        console.log("background_colors = {")
        for (let tiletype in backgrounds) console.log(tab + `"${tiletype}": "${backgrounds[tiletype]}",`)
        console.log("}")
    }
    if (print_infusion) {
        console.log("# Infusion")
        for (let plane in infusion) {
            console.log(plane.replace(" ", "_") + " = {")
            console.log(tab + "\"Infusion\" = {")
            for (let tile in infusion[plane].depth) console.log(tab + tab + `${tile}: "${infusion[plane].depth[tile]} ${infusion[plane].alignment[tile].charAt(0)}",`)
            console.log(tab + "},")
            for (let dict in infusion[plane]) {
                console.log(tab + "\"" + dict + "\" = {")
                for (let tile in infusion[plane][dict]) console.log(tab + tab + `${tile}: "${infusion[plane][dict][tile]}",`)
                console.log(tab + "},")
            }
            console.log("}")
        }
    }
    if (print_portals) {
        console.log("# Portals")
        for (let plane in infusion) {
            console.log(plane.replace(" ", "_") + " = {")
            for (let coords in portals[plane]) {
                console.log(tab + coords + " = {")
                if ("inside" in portals[plane][coords]) {
                    console.log(tab + tab + "Inside: [")
                    for (let portal in portals[plane][coords].inside) console.log(tab + tab + tab + `"${portals[plane][coords].inside[portal]}",`)
                    console.log(tab + tab + "],")
                }
                if ("outside" in portals[plane][coords]) {
                    console.log(tab + tab + "Outside: [")
                    for (let portal in portals[plane][coords].outside) console.log(tab + tab + tab + `"${portals[plane][coords].outside[portal]}",`)
                    console.log(tab + tab + "],")
                }
                console.log(tab + "}")
            }
            console.log("}")
        }
    }
}

function PrintData(print_tiles, print_backgrounds, print_infusion, print_portals) {
    const charname = GetCharName()
    PrintCharData(charname, print_tiles, print_backgrounds, print_infusion, print_portals)
}

function SaveLinesToFile(text_array, filename) {
    const blob = new Blob(
        text_array.map(str => str + "\n"),
        {type: "text/plain;charset=utf-8"}
    )
    saveAs(blob, filename)
}

async function SaveData(charname, save_tiles, save_backgrounds, save_infusion, save_portals) {
    const {tiledata, backgrounds, infusion, portals} = await RetrieveData(charname)

    function tab(n) { return "    ".repeat(n)}
    if (save_tiles) {
        let text = []
        for (let plane in tiledata) {
            text.push(plane.replace(" ", "_") + " = {")
            for (let dict in tiledata[plane]) {
                text.push(tab(1) + "\"" + dict + "\": {")
                for (let tile in tiledata[plane][dict]) text.push(tab(2) + `${tile}: "${tiledata[plane][dict][tile]}",`)
                text.push(tab(1) + "},")
            }
            text.push("}")
        }
        SaveLinesToFile(text, "tile_data.py")
    }
    if (save_backgrounds) {
        let text = []
        text.push("background_colors = {")
        for (let tiletype in backgrounds) text.push(tab(1) + `"${tiletype}": "${backgrounds[tiletype]}",`)
        text.push("}")
        SaveLinesToFile(text, "background_colors.py")
    }
    if (save_infusion) {
        let text = []
        for (let plane in infusion) {
            text.push(plane.replace(" ", "_") + " = {")
            for (let dict in infusion[plane]) {
                text.push(tab(1) + "\"" + dict + "\": {")
                for (let tile in infusion[plane][dict]) text.push(tab(2) + `${tile}: "${infusion[plane][dict][tile]}",`)
                text.push(tab(1) + "},")
            }
            text.push("}")
        }
        SaveLinesToFile(text, "infusion_data.py")
    }
    if (save_portals) {
        let text = []
        for (let plane in infusion) {
            text.push(plane.replace(" ", "_") + " = {")
            for (let coords in portals[plane]) {
                text.push(tab(1) + coords + ": {")
                if ("inside" in portals[plane][coords]) {
                    text.push(tab(2) + "Inside: [")
                    for (let portal in portals[plane][coords].inside) text.push(tab(3) + `"${portals[plane][coords].inside[portal]}",`)
                    text.push(tab(2) + "],")
                }
                if ("outside" in portals[plane][coords]) {
                    text.push(tab(2) + "Outside: [")
                    for (let portal in portals[plane][coords].outside) text.push(tab(3) + `"${portals[plane][coords].outside[portal]}",`)
                    text.push(tab(2) + "],")
                }
                text.push(tab(1) + "}")
            }
            text.push("}")
        }
        SaveLinesToFile(text, "portal_data.py")
    }
}

async function ExportData(charname, ...filters) {
    console.log('Exporting data for ' + charname)
    if (charname == undefined) charname = GetCharName()
    let list_values_ids = await GM.listValues()
    let data = []
    for (let value_id of list_values_ids) {
        const match = MatchRegexp(value_id, String.raw`(?<char>[^/]+)/(?<id>.*)`)
        if (match != null && match.groups.char == charname) {
            if (!filters || MatchAny(match.groups.id, ...filters)) {
                data.push(`${match.groups.id}: ${await GM.getValue(value_id)}`)
            }
        }
    }
    data.sort()
    SaveLinesToFile(data, `${charname}.NexMap`)
}

async function ImportArray(import_array, charname) {
    let count_imports = 0, count_depth_deletes = 0
    const re_timestamp = String.raw`\[(?<timestamp>\d+)\]`
    for (let element of import_array) {
        const {id, timestamp, data} = MatchRegexp(element, String.raw`^(?<id>.*): ${re_timestamp}(?<data>.*)$`).groups
        const local_element = await GM.getValue(`${charname}/${id}`)
        if (local_element == undefined) {
            count_imports += 1
            GM.setValue(`${charname}/${id}`, `[${timestamp}]${data}`)
        }
        else {
            const local_timestamp = MatchRegexp(local_element, String.raw`^${re_timestamp}.*$`).groups.timestamp
            if (local_timestamp < timestamp) {
                count_imports += 1
                const inf_align_match = MatchRegexp(id, String.raw`infusion/alignment/(?<id_right>.*)`)
                if (inf_align_match) {
                    const align_data = await GM.getValue(`${charname}/infusion/alignment/${inf_align_match.groups.id_right}`)
                    const depth_data = await GM.getValue(`${charname}/infusion/depth/${inf_align_match.groups.id_right}`)
                    if (!align_data || !depth_data) continue
                    const pastA = MatchRegexp(align_data, String.raw`${re_timestamp}(?<data>.*)$`).groups; // pizza
                    const pastD = MatchRegexp(depth_data, String.raw`${re_timestamp}(?<data>.*)$`).groups
                    if (pastD.timestamp < timestamp && pastA.data != data) {
                        count_depth_deletes += 1
                        GM.deleteValue(`${charname}/infusion/depth/${inf_align_match.groups.id_right}`)
                    }
                }
                GM.setValue(`${charname}/${id}`, `[${timestamp}]${data}`)
            }
        }
    }
    alert(`Imported ${count_imports} values, and cleared ${count_depth_deletes} infusion depths as side-effect.`)
}

function ImportData(charname) {
    const import_array = document.body.textContent.split("\n").slice(0, -1)
    ImportArray(import_array, charname)
}

function ImportFile(file, charname) {
    if (!file) {
        alert("No file selected!")
        return
    }

    if (charname === undefined) charname = GetCharName()

    var reader = new FileReader()
    reader.onload = function() { ImportArray(reader.result.split("\n").slice(0,-1), charname)}
    reader.readAsText(file)
}

async function ClearData() {
    let list_values_ids = await GM.listValues()
    let count = 0
    for (let value_id of list_values_ids) {
        count += 1
        GM.deleteValue(value_id)
    }
    console.log(`Deleted ${count} values from GM storage.`)
}

async function ClearValues(regexp) {
    let list_values_ids = await GM.listValues()
    let count = 0
    for (let value_id of list_values_ids) {
        if (regexp.exec(value_id)) {
            count += 1
            GM.deleteValue(value_id)
        }
    }
    console.log(`Deleted ${count} values from GM storage.`)
}

async function DeleteValue(id) {
    GM.deleteValue(id)
}

function GetTabName() {
    // check if tab is Game
    if (document.getElementById("CharacterInfo")) {
        if (document.getElementById("Map")) return "Game - Map"
        if (document.getElementById("inventory")) return "Game - Inventory"
        if (document.getElementById("PadForm")) return "Game - Pad"
        if (document.getElementById("NexusMapper")) return "Game - NexusMapper"
        return "Game - ?"; // Either board or weapons pane, didn't find an id to distinguish them
    }
    const match = MatchAny(unsafeWindow.location.search, String.raw`\?op=(?<op>character).*`, String.raw`\?op=(?<op>faction).*`, String.raw`\?op=(?<op>map).*`)
    if (match) return match.groups.op.charAt(0).toUpperCase() + match.groups.op.slice(1)
    if (unsafeWindow.location.origin == "https://www.nexusclash.com") return "Character Selection"

    return "Game - Map"
    return "???"
}

function NMSubtabUI() {
    // Remove Pad if present
    if (document.getElementById('main-right').children[0].children[0].children[3]) {
        // Yes this is horrendously verbose
        document.getElementById('main-right').children[0].children[0].children[3].children[0].innerHTML = ""
    }
    // Remove Nexus Tweaks settings if present
    if (document.getElementById('main-right').children[0].children[1]) {
        // A bit less verbose, but still
        document.getElementById('main-right').children[0].children[1].innerHTML = ""
    }

    const light = '#ffffff'
    const dark = '#eeeeee'

    const spacer = function() { return document.createElement('tr').appendChild(document.createElement('td')).appendChild(document.createElement('br')) }
    const setting_id = function(setting) { return GetCharName() + "/settings/" + setting }
    const setting_enabled = async function(checkbox) { checkbox.checked = Boolean(await GM.getValue(setting_id(checkbox.setting))); settings[checkbox.setting] = checkbox.checked }
    const toggle_setting = function(checkbox) { return function() { settings[checkbox.setting] = checkbox.checked; GM.setValue(setting_id(checkbox.setting), checkbox.checked) } }

    const right_menu_content = document.getElementById('main-right').children[0].children[0].children[2].children[0]
    right_menu_content.replaceChildren()

    // Tab creation
    const NM_div = right_menu_content.appendChild(document.createElement('div'))
    NM_div.id = "NexusMapper"

    // Tab Header
    const NM_content_header = NM_div.appendChild(document.createElement('h4'))
    NM_content_header.colSpan = '2'
    NM_content_header.style.backgroundColor = light
    NM_content_header.style.fontWeight = 'bold'
    NM_content_header.style.textAlign = 'center'
    NM_content_header.textContent = 'NEXUS MAPPER'

    // Mapper Settings
    const mapper_settings_section = NM_div.appendChild(document.createElement('table'))
    mapper_settings_section.style.tableLayout = 'fixed'
    mapper_settings_section.style.backgroundColor = dark

    const MS_header = mapper_settings_section.appendChild(document.createElement('th'))
    MS_header.colSpan = '3'
    MS_header.style.fontWeight = 'bold'
    MS_header.style.textAlign = 'center'
    MS_header.textContent = 'Data Gathering'

    const MS_content = mapper_settings_section.appendChild(document.createElement('tbody'))
    let MS_checkboxes = []

    let MS_row = MS_content.appendChild(document.createElement('tr'))
    MS_checkboxes[0] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[0].innerHTML = '<label><input type="checkbox"> Infusion</label>'
    MS_checkboxes[0].firstChild.firstChild.setting = 'gather/infusion'
    MS_checkboxes[1] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[1].innerHTML = '<label><input type="checkbox"> Tile Types</label>'
    MS_checkboxes[1].firstChild.firstChild.setting = 'gather/tiletypes'
    MS_checkboxes[2] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[2].innerHTML = '<label><input type="checkbox" id="ED_check_portal"> Portals</label>'
    MS_checkboxes[2].firstChild.firstChild.setting = 'gather/portals'

    MS_row = MS_content.appendChild(document.createElement('tr'))
    MS_checkboxes[3] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[3].textContent = '---'
    MS_checkboxes[4] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[4].innerHTML = '<label><input type="checkbox"> Tile Names</label>'
    MS_checkboxes[4].firstChild.firstChild.setting = 'gather/tilenames'
    MS_checkboxes[5] = MS_row.appendChild(document.createElement('td'))
    MS_checkboxes[5].innerHTML = '<label><input type="checkbox"> Tile Colors</label>'
    MS_checkboxes[5].firstChild.firstChild.setting = 'gather/backgrounds'

    for (var i = 0; i < 6; i++) {
        if (!MS_checkboxes[i].firstChild.firstChild) continue
        MS_checkboxes[i].onclick = toggle_setting(MS_checkboxes[i].firstChild.firstChild)
        setting_enabled(MS_checkboxes[i].firstChild.firstChild)
    }

    MS_content.appendChild(spacer())

    // Export Data
    const export_data_section = NM_div.appendChild(document.createElement('table'))
    export_data_section.style.tableLayout = 'fixed'
    export_data_section.style.backgroundColor = light

    const ED_header = export_data_section.appendChild(document.createElement('th'))
    ED_header.colSpan = '3'
    ED_header.style.fontWeight = 'bold'
    ED_header.style.textAlign = 'center'
    ED_header.textContent = 'Export Data'

    const ED_content = export_data_section.appendChild(document.createElement('tbody'))
    let ED_checkboxes = []

    let ED_row = ED_content.appendChild(document.createElement('tr'))
    ED_checkboxes[0] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[0].innerHTML = '<label><input type="checkbox" checked> Infusion Alignment</label>'
    ED_checkboxes[1] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[1].innerHTML = '<label><input type="checkbox"> Tile Types</label>'
    ED_checkboxes[2] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[2].innerHTML = '<label><input type="checkbox" id="ED_check_portal"> Portals</label>'

    ED_row = ED_content.appendChild(document.createElement('tr'))
    ED_checkboxes[3] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[3].innerHTML = '<label><input type="checkbox" checked> Infusion Depth</label>'
    ED_checkboxes[4] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[4].innerHTML = '<label><input type="checkbox"> Tile Names</label>'
    ED_checkboxes[5] = ED_row.appendChild(document.createElement('td'))
    ED_checkboxes[5].innerHTML = '<label><input type="checkbox"> Tile Colors</label>'

    ED_row = ED_content.appendChild(document.createElement('tr'))
    ED_row.appendChild(document.createElement('td')) // padding
    let ED_button = ED_row.appendChild(document.createElement('td'))
    ED_button.innerHTML = '<input type="button" value="Export data"/>'
    ED_button.onclick = function () {
        let filters = []
        if (ED_checkboxes[0].firstChild.firstChild.checked) filters.push('infusion/alignment/.*')
        if (ED_checkboxes[1].firstChild.firstChild.checked) filters.push('tiles/types/.*')
        if (ED_checkboxes[2].firstChild.firstChild.checked) filters.push('portals/.*')
        if (ED_checkboxes[3].firstChild.firstChild.checked) filters.push('infusion/depth/.*')
        if (ED_checkboxes[4].firstChild.firstChild.checked) filters.push('tiles/names/.*')
        if (ED_checkboxes[5].firstChild.firstChild.checked) filters.push('background/.*')
        ExportData(GetCharName(), ...filters)
    }
    ED_button.firstChild.style.width = '100%'

    ED_content.appendChild(spacer())

    // Import Data
    const import_data_section = NM_div.appendChild(document.createElement('table'))
    import_data_section.style.tableLayout = 'fixed'
    import_data_section.style.backgroundColor = dark

    const ID_header = import_data_section.appendChild(document.createElement('th'))
    ID_header.colSpan = '3'
    ID_header.style.fontWeight = 'bold'
    ID_header.style.textAlign = 'center'
    ID_header.textContent = 'Import Data'

    const ID_content = import_data_section.appendChild(document.createElement('tbody'))

    const ID_filename = ID_content.appendChild(document.createElement('tr')).appendChild(document.createElement('td'))
    ID_filename.colSpan = '3'
    ID_filename.innerHTML = '<input type="file" id="importFile" accept=".NexMap"/>'
    ID_filename.firstChild.style.width = '100%'

    const ID_row = ID_content.appendChild(document.createElement('tr'))
    ID_row.appendChild(document.createElement('td')) // padding
    const ID_button = ID_row.appendChild(document.createElement('td'))
    ID_button.innerHTML = '<input type="button" value="Import data"/>'
    ID_button.onclick = function() { ImportFile(document.getElementById('importFile').files[0]) }
    ID_button.align = 'center'
    ID_button.firstChild.style.width = '100%'

    ID_content.appendChild(spacer())

    // Export Data (Python)
    const python_export_section = NM_div.appendChild(document.createElement('table'))
    python_export_section.style.tableLayout = 'fixed'
    python_export_section.style.backgroundColor = light

    const PE_header = python_export_section.appendChild(document.createElement('th'))
    PE_header.colSpan = '2'
    PE_header.style.fontWeight = 'bold'
    PE_header.style.textAlign = 'center'
    PE_header.textContent = 'Export Data (Python format)'

    const PE_content = python_export_section.appendChild(document.createElement('tbody'))

    let PE_row = PE_content.appendChild(document.createElement('tr'))
    const PE_tiles = PE_row.appendChild(document.createElement('td'))
    PE_tiles.innerHTML = '<input type="button" value="Export tile data"/>'
    PE_tiles.onclick = function() { SaveData(GetCharName(), 1,0,0,0) }
    PE_tiles.firstChild.style.width = '100%'
    const PE_backgrounds = PE_row.appendChild(document.createElement('td'))
    PE_backgrounds.innerHTML = '<input type="button" value="Export backgrounds data"/>'
    PE_backgrounds.onclick = function() { SaveData(GetCharName(), 0,1,0,0) }
    PE_backgrounds.firstChild.style.width = '100%'

    PE_row = PE_content.appendChild(document.createElement('tr'))
    const PE_infusion = PE_row.appendChild(document.createElement('td'))
    PE_infusion.innerHTML = '<input type="button" value="Export infusion data"/>'
    PE_infusion.onclick = function() { SaveData(GetCharName(), 0,0,1,0) }
    PE_infusion.firstChild.style.width = '100%'
    const PE_portals = PE_row.appendChild(document.createElement('td'))
    PE_portals.innerHTML = '<input type="button" value="Export portal data"/>'
    PE_portals.onclick = function() { SaveData(GetCharName(), 0,0,0,1) }
    PE_portals.firstChild.style.width = '100%'

    PE_content.appendChild(spacer())

    // Clear Data
    const clear_data_section = NM_div.appendChild(document.createElement('table'))
    clear_data_section.style.tableLayout = 'fixed'
    clear_data_section.style.backgroundColor = dark

    const CD_header = clear_data_section.appendChild(document.createElement('th'))
    CD_header.colSpan = '3'
    CD_header.style.fontWeight = 'bold'
    CD_header.style.textAlign = 'center'
    CD_header.textContent = 'Clear Data'

    const CD_content = clear_data_section.appendChild(document.createElement('tbody'))
    const CD_row = CD_content.appendChild(document.createElement('tr'))

    CD_row.appendChild(document.createElement('td'))
    const CD_button = CD_row.appendChild(document.createElement('td'))
    CD_row.appendChild(document.createElement('td'))

    CD_button.innerHTML = '<input type="button" disabled value="Clear Data"/>'
    CD_button.onclick = function() { ClearValues(new RegExp(GetCharName() + '/.*')) }
    CD_button.firstChild.style.width = '100%'

    CD_content.appendChild(spacer())
}

function IngameSidebarUI(is_NMsubtab) {
    const menu_TR = document.getElementById("sidebar-menu").firstChild.firstChild
    const NMsubtab_button = document.createElement('td')
    NMsubtab_button.innerHTML = '<input class="sidebar_menu" type="button" value="Nexus Mapper"/>'
    NMsubtab_button.onclick = function() { NMSubtabUI()}
    menu_TR.appendChild(NMsubtab_button)
}

async function GetCharNamesFromData() {
    const list_values_ids = await GM.listValues()
    let list_chars = []

    for (let value_id of list_values_ids) {
        const match = MatchRegexp(value_id, String.raw`(?<char>${re_name})/.*`)
        if (!match) continue
        const char = match.groups.char
        if (char == "alert") continue
        if (!list_chars.includes(char)) list_chars.push(char)
    }

    return list_chars
}

async function EnhancedIngameMapUI() {
    const ingame_map = document.getElementById("Map").children[0].children[0]
    let map_tiles = []
    for (let i = 0; i < 5; i++) {
        map_tiles.push([])
        for (let j = 0; j < 5; j++) {
            map_tiles[i].push(ingame_map.children[i].children[j])
        }
    }
    const area_desc = document.getElementById("AreaDescription")
    if (area_desc == null) return

    const charname = GetCharName()
    const {plane} = MatchRegexp(area_desc.getElementsByTagName("b")[0].childNodes[0].textContent, String.raw`(?<name>${re_name}) \(${re_coords} (?<plane>${re_name}), an? `).groups
    const preserve_timestamp = false
    const Data = async function(id) { if (preserve_timestamp) { return await GM.getValue(`${charname}/${id}`)} else { let data = await GM.getValue(`${charname}/${id}`); if (!data) return data; return data.replace(/\[\d+\]/, "")} }
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const map_tile = map_tiles[i][j]
            if (map_tile.title == undefined) continue
            if (map_tile.title == "Unknown") continue
            const match = MatchRegexp(map_tile.title, String.raw`\(${re_coords}\) (?<tile_name>${re_name}), an? (?<tile_type>${re_name})`)
            if (!match) {
                console.log("[EnhancedIngameMapUI] Error with tilename: ", map_tile.title)
                continue
            }
            let {x, y} = match.groups
            const infusion_alignment = await Data(`infusion/alignment/${plane}/(${x},${y})`)
            const infusion_depth = await Data(`infusion/depth/${plane}/(${x},${y})`)
            if (infusion_alignment) {
                if (!MatchRegexp(map_tile.style.backgroundImage, String.raw`images/g/inf/infusion-.*\.gif`)) {
                    if (map_tile.style.backgroundImage) map_tile.style.backgroundImage = `url('images/g/inf/infusion-${infusion_alignment.charAt(0).toLowerCase() + infusion_alignment.slice(1)}.gif'), ` + map_tile.style.backgroundImage
                    else map_tile.style.backgroundImage = `url('images/g/inf/infusion-${infusion_alignment.charAt(0).toLowerCase() + infusion_alignment.slice(1)}.gif')`
                    if (infusion_depth) {
                        const tileTable = document.createElement('table')
                        let middleElement = map_tile.firstChild
                        let infElement = document.createElement('td')
                        infElement.textContent = `\u00a0${infusion_depth} ${infusion_alignment.charAt(0)}`
                        infElement.style.textAlign = "left"
                        if (!middleElement) {
                            map_tile.appendChild(tileTable)
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(document.createElement('br'))
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(document.createElement('br'))
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(infElement)
                        } else {
                            map_tile.replaceChild(tileTable, middleElement)
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(document.createElement('br'))
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(document.createElement('td'))
                            tileTable.lastChild.lastChild.appendChild(middleElement)
                            tileTable.appendChild(document.createElement('tr'))
                            tileTable.lastChild.appendChild(infElement)
                        }
                    }
                }
            }
        }
    }
}

function DrawInfusion(canvas_ctx, x, y, xf, yf, color, D) {
    const X = (x - unsafeWindow.mapDim[unsafeWindow.cur_plane].x_offset) * 24
    const Y = (y - unsafeWindow.mapDim[unsafeWindow.cur_plane].y_offset) * 24

    canvas_ctx.fillStyle = color
    canvas_ctx.fillRect(X*xf, Y*yf, 6*xf, 23*yf)
    canvas_ctx.lineWidth = 1
    canvas_ctx.strokeStyle = 'black'
    canvas_ctx.strokeRect(X*xf, Y*yf, 6*xf, 23*yf)

    if (D > -1) {
        const fontsize = Math.floor(14 * yf)
        canvas_ctx.font = `${fontsize}px Arial`
        canvas_ctx.lineWidth = 3
        if (D == 10) {
            canvas_ctx.strokeText(D, (6+X)*xf, (17+Y)*yf)
            canvas_ctx.fillText(D, (6+X)*xf, (17+Y)*yf)

        }
        else {
            canvas_ctx.strokeText(D, (10+X)*xf, (17+Y)*yf)
            canvas_ctx.fillText(D, (10+X)*xf, (17+Y)*yf)
        }
        canvas_ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    }
}

async function EnhancedGlobalMapUI() {
    const map_buttons_div = document.getElementById('navbarsExample08')
    const char_list = await GetCharNamesFromData()
    const char_dropdown_div = map_buttons_div.appendChild(document.createElement('div'))
    const char_dropdown_label = char_dropdown_div.appendChild(document.createElement('div'))
    char_dropdown_label.textContent = "Display infusion data for:"
    const char_dropdown = char_dropdown_div.appendChild(document.createElement('select'))
    char_dropdown.name = "Character Name"
    char_dropdown.id = "charname"
    let charname = ""
    let infusion = {}
    char_dropdown.onchange = async function() { charname = char_dropdown.value; infusion = (await RetrieveData(charname, false)).infusion; map_buttons_div.click() }
    const no_char = char_dropdown.appendChild(document.createElement('option'))
    no_char.value = ""
    no_char.textContent = "---"
    for (let char of char_list) {
        const char_option = char_dropdown.appendChild(document.createElement('option'))
        char_option.value = char
        char_option.textContent = char
    }

    map_buttons_div.onclick = function() {
        const canvas = document.getElementById('map')
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!charname) return

        const plane = {
            406: "Cordillera",
            416: "Centrum",
            402: "Elysium",
            403: "Stygia",
            404: "Purgatorio",
            405: "Purgatorio",
        }[unsafeWindow.cur_plane]
        let tile_alignment = {}
        let tile_inf_depth = {}

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
        })

        if (plane in infusion) {
            tile_alignment = infusion[plane].alignment
            tile_inf_depth = infusion[plane].depth
        }

        let xf = 1, yf = 1
        if (canvas.style.width) xf = canvas.width / canvas.style.width.slice(0,-2)
        if (canvas.style.height) yf = canvas.height / canvas.style.height.slice(0,-2)

        for (let coords in tile_alignment) {
            const {x, y} = MatchRegexp(coords, String.raw`\((?<x>\d+),(?<y>\d+)\)`).groups
            const color = {
                Good:      "#00FFFF",
                Unaligned: "#FFD700",
                Evil:      "#FF2020",
            }[tile_alignment[coords]]
            let D = -1
            if (coords in tile_inf_depth) D = Math.floor(tile_inf_depth[coords] / 50)
            DrawInfusion(ctx, x, y, xf, yf, color, D)
        }
    }
    map_buttons_div.click()
}

async function DevAlert(version) {
    if (!await GM.getValue(`alert/${version}`)) {
        alert(`You're running an unstable version of Nexus Mapper.\nCaution is advised.\nVersion: ${version}`)
        GM.setValue(`alert/${version}`, true)
    }
}

function main() {
    const version = GM.info.script.version
    if (MatchRegexp(version, String.raw`.*\.dev\..*`)) DevAlert(version)

    const tab = GetTabName()

    if (MatchRegexp(tab, "Game.*")) {
        GatherData(tab == "Game - Map")
        if (tab == "Game - Map") EnhancedIngameMapUI()
        IngameSidebarUI()
    }
    else if (tab == "Map") EnhancedGlobalMapUI()

    RegisterFunctions()

    console.log('[NexusMapper] Bawk!')
}

main()
