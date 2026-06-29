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
		"apply_scene_ops":
			return _apply_scene_ops(params)
		_:
			return { "__error": "Unknown method: %s" % method }

# --- Scene editing -----------------------------------------------------------
# Applies a list of structured operations to the open scene THROUGH the editor,
# so the engine validates everything and writes a correct .tscn — far safer than
# letting an AI hand-edit the scene file's custom text format.

func _apply_scene_ops(params: Dictionary) -> Dictionary:
	var ei := get_editor_interface()
	var scene_path := String(params.get("scene", ""))
	if scene_path != "":
		ei.open_scene_from_path(scene_path)
	var root := ei.get_edited_scene_root()
	if root == null:
		return { "__error": "No scene is open to edit." }
	var ops: Array = params.get("ops", [])
	var applied := 0
	for op in ops:
		if typeof(op) != TYPE_DICTIONARY:
			return { "__error": "Op %d is not an object." % applied }
		var err := _apply_one(root, op)
		if err != "":
			return { "__error": "Op %d (%s) failed: %s" % [applied, String(op.get("op", "?")), err] }
		applied += 1
	ei.save_scene()
	return { "ok": true, "applied": applied }

func _resolve(root: Node, op: Dictionary) -> Node:
	var p := String(op.get("node", op.get("path", "")))
	if p == "" or p == ".":
		return root
	return root.get_node_or_null(NodePath(p))

func _coerce(v):
	if typeof(v) == TYPE_DICTIONARY and v.has("__type"):
		var t := String(v["__type"])
		var a: Array = v.get("values", [])
		match t:
			"Vector2":
				return Vector2(a[0], a[1])
			"Vector2i":
				return Vector2i(a[0], a[1])
			"Vector3":
				return Vector3(a[0], a[1], a[2])
			"Color":
				if a.size() >= 4:
					return Color(a[0], a[1], a[2], a[3])
				return Color(a[0], a[1], a[2])
			"NodePath":
				return NodePath(String(v.get("value", "")))
			_:
				return null
	return v

func _apply_one(root: Node, op: Dictionary) -> String:
	var kind := String(op.get("op", ""))
	match kind:
		"add_node":
			var type := String(op.get("type", ""))
			if not ClassDB.class_exists(type) or not ClassDB.can_instantiate(type):
				return "unknown or non-instantiable type '%s'" % type
			var obj = ClassDB.instantiate(type)
			if obj == null or not (obj is Node):
				return "could not instantiate '%s'" % type
			var node := obj as Node
			if op.has("name"):
				node.name = String(op["name"])
			var parent := root
			var parent_path := String(op.get("parent", ""))
			if parent_path != "":
				parent = root.get_node_or_null(NodePath(parent_path))
				if parent == null:
					return "parent not found: %s" % parent_path
			parent.add_child(node)
			node.owner = root
			if op.has("properties") and typeof(op["properties"]) == TYPE_DICTIONARY:
				for k in op["properties"].keys():
					node.set(String(k), _coerce(op["properties"][k]))
			if String(op.get("script", "")) != "":
				var scr = load(String(op["script"]))
				if scr != null:
					node.set_script(scr)
			return ""
		"set_property":
			var n := _resolve(root, op)
			if n == null:
				return "node not found"
			if not op.has("property"):
				return "missing 'property'"
			n.set(String(op["property"]), _coerce(op.get("value", null)))
			return ""
		"attach_script":
			var n2 := _resolve(root, op)
			if n2 == null:
				return "node not found"
			var scr2 = load(String(op.get("script", "")))
			if scr2 == null:
				return "script not found: %s" % String(op.get("script", ""))
			n2.set_script(scr2)
			return ""
		"remove_node":
			var n3 := _resolve(root, op)
			if n3 == null:
				return "node not found"
			if n3 == root:
				return "cannot remove the scene root"
			n3.get_parent().remove_child(n3)
			n3.queue_free()
			return ""
		_:
			return "unknown op '%s'" % kind

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
