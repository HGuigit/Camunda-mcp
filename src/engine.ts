import fs from 'fs';
import path from 'path';
import os from 'os';
const BpmnModdleMod = require('bpmn-moddle');
const BpmnModdle = BpmnModdleMod.default || BpmnModdleMod.BpmnModdle || BpmnModdleMod;
// @ts-ignore
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda';
// @ts-ignore
import * as autoLayoutMod from 'bpmn-auto-layout';
const layoutProcess = autoLayoutMod.layoutProcess || autoLayoutMod.default || autoLayoutMod;

const LOG_PREFIX = '[camunda-mcp-engine]';

export class BpmnEngine {
  private moddle: any;
  private currentFilePath: string | null = null;
  private currentDiagramId: string | null = null;
  private rootDefinitions: any = null;

  constructor() {
    this.moddle = new BpmnModdle({
      camunda: camundaModdleDescriptor
    });
  }

  /**
   * Initializes a new empty BPMN diagram or loads an existing one.
   */
  async createModel(name: string = `diagram-${Date.now()}`): Promise<{ diagramId: string, filePath: string }> {
    const fileName = `${name}.bpmn`;
    const filePath = path.join(os.tmpdir(), fileName);
    this.currentDiagramId = `diagram-${Date.now()}`;
    this.currentFilePath = filePath;

    // minimal XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/BPMN/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"
                  exporter="Camunda MCP Plugin" exporterVersion="0.1.0">
  <bpmn:process id="Process_1" isExecutable="true" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    const { rootElement } = await this.moddle.fromXML(xml);
    this.rootDefinitions = rootElement;
    await this.save();
    return { diagramId: this.currentDiagramId, filePath: this.currentFilePath };
  }

  async loadModel(filePath: string): Promise<void> {
    const xml = fs.readFileSync(filePath, 'utf-8');
    const { rootElement } = await this.moddle.fromXML(xml);
    this.rootDefinitions = rootElement;
    this.currentFilePath = filePath;
    this.currentDiagramId = path.basename(filePath);
  }

  async save(): Promise<void> {
    if (!this.rootDefinitions || !this.currentFilePath) return;
    const { xml } = await this.moddle.toXML(this.rootDefinitions, { format: true });
    fs.writeFileSync(this.currentFilePath, xml, 'utf-8');
  }

  getProcess() {
    return this.rootDefinitions.rootElements.find((e: any) => e.$type === 'bpmn:Process');
  }

  getPlane() {
    return this.rootDefinitions.diagrams[0].plane;
  }

  /** Auto layout using bpmn-auto-layout */
  async autoLayout() {
    if (!this.currentFilePath) return;
    try {
      const xml = fs.readFileSync(this.currentFilePath, 'utf-8');
      const layoutedXml = await layoutProcess(xml);
      const { rootElement } = await this.moddle.fromXML(layoutedXml);
      this.rootDefinitions = rootElement;
      await this.save();
      console.log(`${LOG_PREFIX} Applied auto layout`);
    } catch (err) {
      console.error(`${LOG_PREFIX} Auto layout failed`, err);
    }
  }

  // --- Elements Manipulation ---

  addElement(type: string, name: string, x: number = 200, y: number = 200, props: any = {}) {
    const id = `${type.split(':')[1]}_${Math.random().toString(36).substr(2, 9)}`;
    const process = this.getProcess();
    const plane = this.getPlane();

    // Create semantic element
    const element = this.moddle.create(type, { id, name, ...props });

    if (['bpmn:Participant', 'bpmn:MessageFlow'].includes(type)) {
      if (!this.rootDefinitions.rootElements) this.rootDefinitions.rootElements = [];
      let collab = this.rootDefinitions.rootElements.find((e: any) => e.$type === 'bpmn:Collaboration');
      if (!collab) {
        collab = this.moddle.create('bpmn:Collaboration', { id: `Collaboration_${Math.random().toString(36).substr(2, 9)}` });
        this.rootDefinitions.rootElements.push(collab);
      }
      if (type === 'bpmn:Participant') {
        if (!collab.participants) collab.participants = [];
        collab.participants.push(element);
      } else {
        if (!collab.messageFlows) collab.messageFlows = [];
        collab.messageFlows.push(element);
      }
    } else if (['bpmn:TextAnnotation', 'bpmn:Group'].includes(type)) {
      if (!process.artifacts) process.artifacts = [];
      process.artifacts.push(element);
    } else if (type === 'bpmn:Lane') {
      if (!process.laneSets) process.laneSets = [];
      let laneSet = process.laneSets[0];
      if (!laneSet) {
        laneSet = this.moddle.create('bpmn:LaneSet', { id: `LaneSet_${Math.random().toString(36).substr(2, 9)}` });
        process.laneSets.push(laneSet);
      }
      if (!laneSet.lanes) laneSet.lanes = [];
      laneSet.lanes.push(element);
    } else {
      if (!process.flowElements) process.flowElements = [];
      process.flowElements.push(element);
    }

    // Create DI shape
    const bounds = this.moddle.create('dc:Bounds', { x, y, width: 100, height: 80 });

    // Custom sizes based on type
    if (type.includes('Event')) { bounds.width = 36; bounds.height = 36; }
    else if (type.includes('Gateway')) { bounds.width = 50; bounds.height = 50; }

    const shape = this.moddle.create('bpmndi:BPMNShape', {
      id: `${id}_di`,
      bpmnElement: element,
      bounds
    });

    if (!plane.planeElement) plane.planeElement = [];
    plane.planeElement.push(shape);

    return { elementId: id, type, name, x, y };
  }

  connectElements(sourceId: string, targetId: string) {
    const id = `Flow_${Math.random().toString(36).substr(2, 9)}`;
    const process = this.getProcess();
    const plane = this.getPlane();

    const source = process.flowElements.find((e: any) => e.id === sourceId);
    const target = process.flowElements.find((e: any) => e.id === targetId);

    if (!source || !target) throw new Error("Source or target not found");

    const flow = this.moddle.create('bpmn:SequenceFlow', { id, sourceRef: source, targetRef: target });
    if (!process.flowElements) process.flowElements = [];
    process.flowElements.push(flow);

    if (!source.outgoing) source.outgoing = [];
    source.outgoing.push(flow);
    if (!target.incoming) target.incoming = [];
    target.incoming.push(flow);

    // Add simplistic edge representation (you can expand this for proper waypoints calculation)
    const edge = this.moddle.create('bpmndi:BPMNEdge', {
      id: `${id}_di`,
      bpmnElement: flow,
      waypoint: [
        this.moddle.create('dc:Point', { x: 0, y: 0 }),
        this.moddle.create('dc:Point', { x: 100, y: 100 })
      ]
    });

    if (!plane.planeElement) plane.planeElement = [];
    plane.planeElement.push(edge);

    return { connectionId: id, sourceId, targetId };
  }

  setProperties(elementId: string, props: any) {
    const process = this.getProcess();
    const element = process.flowElements?.find((e: any) => e.id === elementId);
    if (!element) throw new Error(`Element ${elementId} not found`);

    if (props.name !== undefined) element.name = props.name;
    if (props.documentation) {
      const doc = this.moddle.create('bpmn:Documentation', { text: props.documentation });
      element.documentation = [doc];
    }

    // Camunda specific properties
    if (props.implementationType && props.implementationValue) {
      if (props.implementationType === 'class') {
        element.set('camunda:class', props.implementationValue);
      } else if (props.implementationType === 'delegateExpression') {
        element.set('camunda:delegateExpression', props.implementationValue);
      } else if (props.implementationType === 'expression') {
        element.set('camunda:expression', props.implementationValue);
      } else if (props.implementationType === 'external') {
        element.set('camunda:type', 'external');
        element.set('camunda:topic', props.implementationValue);
      }
    }
    if (props.taskTopic) {
      element.set('camunda:topic', props.taskTopic);
      element.set('camunda:type', 'external');
    }

    // Camunda Element Templates
    if (props.modelerTemplate) {
      element.set('camunda:modelerTemplate', props.modelerTemplate);
    }

    // Inline Scripts / Execution Listeners stub
    if (props.executionListeners && Array.isArray(props.executionListeners)) {
      let extensionElements = element.extensionElements;
      if (!extensionElements) {
        extensionElements = this.moddle.create('bpmn:ExtensionElements', { values: [] });
        element.extensionElements = extensionElements;
      }

      props.executionListeners.forEach((listener: any) => {
        const el = this.moddle.create('camunda:ExecutionListener', { event: listener.event });
        if (listener.script) {
          const script = this.moddle.create('camunda:Script', {
            scriptFormat: listener.script.format || 'javascript',
            value: listener.script.value
          });
          el.script = script;
        } else if (listener.class) {
          el.class = listener.class;
        } else if (listener.expression) {
          el.expression = listener.expression;
        } else if (listener.delegateExpression) {
          el.delegateExpression = listener.delegateExpression;
        }
        extensionElements.values.push(el);
      });
    }
  }

  setIoMapping(elementId: string, inputs: any[], outputs: any[]) {
    const process = this.getProcess();
    const element = process.flowElements.find((e: any) => e.id === elementId);
    if (!element) throw new Error(`Element ${elementId} not found`);

    let extensionElements = element.extensionElements;
    if (!extensionElements) {
      extensionElements = this.moddle.create('bpmn:ExtensionElements', { values: [] });
      element.extensionElements = extensionElements;
    }

    let inputOutput = extensionElements.values.find((e: any) => e.$type === 'camunda:InputOutput');
    if (!inputOutput) {
      inputOutput = this.moddle.create('camunda:InputOutput', { inputParameters: [], outputParameters: [] });
      extensionElements.values.push(inputOutput);
    }

    if (inputs && inputs.length > 0) {
      inputs.forEach(inp => {
        const param = this.moddle.create('camunda:InputParameter', { name: inp.target, value: inp.source });
        if (!inputOutput.inputParameters) inputOutput.inputParameters = [];
        inputOutput.inputParameters.push(param);
      });
    }

    if (outputs && outputs.length > 0) {
      outputs.forEach(out => {
        const param = this.moddle.create('camunda:OutputParameter', { name: out.target, value: out.source });
        if (!inputOutput.outputParameters) inputOutput.outputParameters = [];
        inputOutput.outputParameters.push(param);
      });
    }
  }

  setTaskHeaders(elementId: string, headers: any[]) {
    const process = this.getProcess();
    const element = process.flowElements.find((e: any) => e.id === elementId);
    if (!element) throw new Error(`Element ${elementId} not found`);

    let extensionElements = element.extensionElements;
    if (!extensionElements) {
      extensionElements = this.moddle.create('bpmn:ExtensionElements', { values: [] });
      element.extensionElements = extensionElements;
    }

    let properties = extensionElements.values.find((e: any) => e.$type === 'camunda:Properties');
    if (!properties) {
      properties = this.moddle.create('camunda:Properties', { values: [] });
      extensionElements.values.push(properties);
    }

    if (headers && headers.length > 0) {
      headers.forEach(header => {
        const prop = this.moddle.create('camunda:Property', { name: header.key, value: header.value });
        if (!properties.values) properties.values = [];
        properties.values.push(prop);
      });
    }
  }

  deleteElement(elementId: string) {
    const process = this.getProcess();
    const plane = this.getPlane();

    if (!process.flowElements) return;

    // Find element
    const elementIndex = process.flowElements.findIndex((e: any) => e.id === elementId);
    if (elementIndex === -1) throw new Error(`Element ${elementId} not found`);
    const element = process.flowElements[elementIndex];

    // Remove sequence flows attached to it
    if (element.incoming) {
      element.incoming.forEach((flow: any) => {
        const flowIndex = process.flowElements.findIndex((e: any) => e.id === flow.id);
        if (flowIndex !== -1) process.flowElements.splice(flowIndex, 1);
        if (plane.planeElement) {
            const diIndex = plane.planeElement.findIndex((di: any) => di.bpmnElement?.id === flow.id);
            if (diIndex !== -1) plane.planeElement.splice(diIndex, 1);
        }
      });
    }
    if (element.outgoing) {
      element.outgoing.forEach((flow: any) => {
        const flowIndex = process.flowElements.findIndex((e: any) => e.id === flow.id);
        if (flowIndex !== -1) process.flowElements.splice(flowIndex, 1);
        if (plane.planeElement) {
            const diIndex = plane.planeElement.findIndex((di: any) => di.bpmnElement?.id === flow.id);
            if (diIndex !== -1) plane.planeElement.splice(diIndex, 1);
        }
      });
    }

    // Remove element
    process.flowElements.splice(elementIndex, 1);

    // Remove DI
    if (plane.planeElement) {
        const diIndex = plane.planeElement.findIndex((di: any) => di.bpmnElement?.id === elementId);
        if (diIndex !== -1) plane.planeElement.splice(diIndex, 1);
    }
  }

  getElement(elementId: string) {
    const process = this.getProcess();
    if (!process.flowElements) return null;
    return process.flowElements.find((e: any) => e.id === elementId);
  }

  listElements() {
    const process = this.getProcess();
    if (!process.flowElements) return [];
    return process.flowElements.map((e: any) => ({ id: e.id, type: e.$type, name: e.name }));
  }

  async getDiagramXml() {
    if (!this.rootDefinitions) return null;
    const { xml } = await this.moddle.toXML(this.rootDefinitions, { format: true });
    return xml;
  }

  async importXml(xml: string) {
    const { rootElement } = await this.moddle.fromXML(xml);
    this.rootDefinitions = rootElement;
    if (this.currentFilePath) {
      await this.save();
    }
  }

  moveElement(elementId: string, x: number, y: number) {
    const plane = this.getPlane();
    if (!plane.planeElement) return;
    const shape = plane.planeElement.find((di: any) => di.bpmnElement?.id === elementId);
    if (shape && shape.bounds) {
        shape.bounds.x = x - (shape.bounds.width / 2); // Center x
        shape.bounds.y = y - (shape.bounds.height / 2); // Center y
    }
  }

  resizeElement(elementId: string, width: number, height: number) {
    const plane = this.getPlane();
    if (!plane.planeElement) return;
    const shape = plane.planeElement.find((di: any) => di.bpmnElement?.id === elementId);
    if (shape && shape.bounds) {
        shape.bounds.width = width;
        shape.bounds.height = height;
    }
  }

  setFlowWaypoints(flowId: string, waypoints: any[]) {
    const plane = this.getPlane();
    if (!plane.planeElement) return;
    const edge = plane.planeElement.find((di: any) => di.bpmnElement?.id === flowId);
    if (edge) {
      edge.waypoint = waypoints.map((wp: any) => this.moddle.create('dc:Point', { x: wp.x, y: wp.y }));
    }
  }

}

// Singleton instance
export const engine = new BpmnEngine();
