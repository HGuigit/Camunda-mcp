# Camunda MCP Server Tools Documentation

This document describes all tools available in the Camunda MCP Server, their purpose, and best practices for interacting with the server.

The server supports creating, reading, updating, and deleting BPMN diagrams manually by x/y coordinates and programmatic manipulation via Moddle, and allows interaction with advanced Camunda elements (like Execution Listeners, Scripts, Variables mapping).

## General Concepts
*   **Coordinate system**: X and Y coordinates map directly to `dc:Bounds` x/y on the BPMN DI. It is highly recommended to layout elements left-to-right (e.g. increase X by ~150px per step).
*   **Camunda 7 vs 8**: `set_properties` supports standard Camunda 7 properties like `camunda:class`, `camunda:delegateExpression`, `camunda:expression`, or `camunda:topic` via `implementationType`.

## Core Tools

### create_model
**Description:** Initializes a new blank diagram. This should be the first call when starting a new session. It returns the newly created `diagramId`.

### build_process
**Description:** Declarative process builder that creates all elements and flows in a single call. Use this to heavily optimize AI generation by passing a full graph of `elements` and `flows`. Automatically resolves reference IDs. Set `autoLayout=true` if you want it neatly formatted instead of specifying raw X/Y coordinates.

### auto_layout
**Description:** Applies a branch-aware, smart layout algorithm to position all elements in the diagram automatically. Excellent as a fallback if the manual X/Y coordinates yield messy diagrams.

### add_task
**Description:** Places a task (e.g. `bpmn:ServiceTask`, `bpmn:UserTask`) at specified `x` and `y` coordinates. Returns the new `elementId`.

### add_gateway
**Description:** Places a Gateway (e.g. `bpmn:ExclusiveGateway`, `bpmn:ParallelGateway`) at `x` and `y` coordinates.

### connect_elements
**Description:** Connects two previously created elements with a SequenceFlow. Requires `sourceId` and `targetId`.

### set_properties
**Description:** Very powerful tool. Allows mapping execution configurations. Supports inline scripts, execution listeners, expression values, classes, etc.
**Example parameter usage:**
```json
{
  "elementId": "ServiceTask_1",
  "implementationType": "external",
  "implementationValue": "payment-topic",
  "executionListeners": [
     {
       "event": "start",
       "script": {
         "format": "javascript",
         "value": "console.log('Task started');"
       }
     }
  ]
}
```

### set_io_mapping
**Description:** Maps process variables mapping `camunda:InputOutput` params. Takes `inputs` (source, target) and `outputs`.

### patch_element
**Description:** Superset of `set_properties`, `set_flow_waypoints` and `move_element`. Use it to update any combination of properties, coordinates, or layout waypoints in a single operation.

## Utility Tools

*   **get_diagram_xml**: Extracts the full BPMN 2.0 XML of the current diagram.
*   **list_elements**: Gets a list of elements currently tracked.
*   **delete_element**: Deletes a specific element by ID.
*   **move_element**: Translates the center of an element to new X/Y coords.

**Remember**: Always build models cleanly left to right, test your process with `validate_layout`, and apply `auto_layout` if manual positioning produces crossing or disjointed sequence flows.
