@tool
extends EditorPlugin

# Zirtola Bridge — runs inside the Godot editor and connects to the Zirtola app
# over a local WebSocket. Zirtola sends JSON-RPC requests; we reply with live
# editor data (scene tree, project info, in-editor screenshots) and can run /
# stop / reload the project on command.
#
# Protocol:
#   incoming request:  { "id": int, "method": String, "params": Dictionary }
#   outgoing response: { "id": int, "result": Variant } or { "id": int, "error": String }
#   outgoing hello:    { "type": "hello", "godotVersion": String, "projectName": String }
#   outgoing event:    { "type": "event", "event": String, ... }

const URL := "ws://127.0.0.1:3728"
const RECONNECT_INTERVAL := 2.0

var _ws := WebSocketPeer.new()
var _was_open := false
var _reconnect_timer := 0.0
var _connecting := false

func _enter_tree() -> void:
	set_process(true)
	_connect()

func _exit_tree() -> void:
	set_process(false)
	_ws.close()

func _connect() -> void:
	_connecting = true
	var err := _ws.connect_to_url(URL)
	if err != OK:
		_connecting = false

func _process(delta: float) -> void:
	_ws.poll()
	var state := _ws.get_ready_state()

	match state:
		WebSocketPeer.STATE_OPEN:
			_connecting = false
			if not _was_open:
				_was_open = true
				_send_hello()
			while _ws.get_available_packet_count() > 0:
				var pkt := _ws.get_packet()
				_handle_text(pkt.get_string_from_utf8())
		WebSocketPeer.STATE_CLOSED:
			if _was_open:
				_was_open = false
			# Attempt to reconnect on an interval.
			_reconnect_timer += delta
			if _reconnect_timer >= RECONNECT_INTERVAL and not _connecting:
				_reconnect_timer = 0.0
				_ws = WebSocketPeer.new()
				_connect()

func _send_hello() -> void:
	_send({
		"type": "hello",
		"godotVersion": Engine.get_version_info().get("string", ""),
		"projectName": ProjectSettings.get_setting("application/config/name", "Untitled"),
	})

func _send(obj: Dictionary) -> void:
	_ws.send_text(JSON.stringify(obj))

func _handle_text(text: String) -> void:
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var id = parsed.get("id", null)
	var method := String(parsed.get("method", ""))
	var params: Dictionary = parsed.get("params", {})
	var result = _dispatch(method, params)
	if id != null:
		if result is Dictionary and result.has("__error"):
			_send({ "id": id, "error": result["__error"] })
		else:
			_send({ "id": id, "result": result })

func _dispatch(method: String, params: Dictionary):
	match method:
		"ping":
			return { "ok": true }
		"get_project_info":
			return {
				"name": ProjectSettings.get_setting("application/config/name", "Untitled"),
				"godotVersion": Engine.get_version_info().get("string", ""),
			}
		"get_scene_tree":
			var root := get_editor_interface().get_edited_scene_root()
			if root == null:
				return { "tree": null }
			return { "tree": _node_to_dict(root) }
		"run":
			get_editor_interface().play_main_scene()
			return { "ok": true }
		"stop":
			get_editor_interface().stop_playing_scene()
			return { "ok": true }
		"reload":
			# Rescan the filesystem so external edits (e.g. from Zirtola) are picked up.
			get_editor_interface().get_resource_filesystem().scan()
			return { "ok": true }
		"capture_viewport":
			return _capture_viewport()
		_:
			return { "__error": "Unknown method: %s" % method }

func _node_to_dict(node: Node) -> Dictionary:
	var d := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": [],
	}
	var scr := node.get_script()
	if scr != null and scr.resource_path != "":
		d["script"] = scr.resource_path
	for child in node.get_children():
		d["children"].append(_node_to_dict(child))
	return d

func _capture_viewport() -> Dictionary:
	var control := get_editor_interface().get_base_control()
	if control == null:
		return { "__error": "No editor viewport available." }
	var img := control.get_viewport().get_texture().get_image()
	if img == null:
		return { "__error": "Could not read the viewport image." }
	var buf := img.save_png_to_buffer()
	return { "png_base64": Marshalls.raw_to_base64(buf) }
