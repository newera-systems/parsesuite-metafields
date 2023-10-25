import 'reflect-metadata';
import {BaseObject} from "@goplan-finance/utils";

export interface GridOptions {
    canView: boolean;
    canRead: boolean;
    canEdit: boolean;
    canFilter: boolean;
    canSort: boolean;
}

export const defaultConfig: Readonly<GridOptions> = {
    canView: true,
    canRead: true,
    canEdit: false,
    canFilter: true,
    canSort: false,
} as const;

export interface ParseModelClass<T = BaseObject> {
    new (...args: any[]): T;
    className: string;
}

export interface RegisteredModelData {
    classConstructor: ParseModelClass;
    identifier: string;
    label: string;
    i18n: string;
}

export const registeredParseModels: Map<string, RegisteredModelData> = new Map<string, RegisteredModelData>();

/**
 * Decorator function to register a ParseModel with optional configurations.
 *
 * @param {Partial<{
 *        identifier: string;
 *        label: string;
 *        i18n: string;
 * }>} [options] - Configuration options for the ParseModel.
 * @returns {Function} - A decorator function.
 *
 * @example
 * - @ParseModel({identifier: 'test', label: 'test', i18n: 'test'})
 *    class Test extends BaseObject {
 *      className = 'Test';
 *    }
 * @usage
 * Reflect.getMetadata('ParseModel', Test) return a RegisteredModelData
 */
export function ParseModel(options?: Partial<{
        identifier: string; // unique identifier for the entity by default it's the class name
        label: string; // label for the entity
        i18n: string; // i18n key for the entity
}>): Function {
    return function (target: ParseModelClass) {
        const className = target.className;
        const label = options?.label ?? className;
        const i18n = options?.i18n ?? className;
        const id = options?.identifier ?? className;
        const data:RegisteredModelData = {
            classConstructor: target,
            identifier: id,
            label,
            i18n
        };
        Reflect.defineMetadata('ParseModel', data, target);
        registeredParseModels.set(data.identifier, data);
    };
}

export interface FieldMetaData {
    type: "string" | "number" | "boolean" | "array"| "object" | "date"|  "pointer" | string;
    label: string;
    i18n: string;
    gridConfig: Partial<GridOptions>;
    addGetterSetter?: boolean;
    link?: ParseModelClass; // if type is pointer or Pointer we need to know the linked class
}

/**
 * Decorator function to register a field with optional configurations.
 * @param {Partial<{FieldMetaData}>} [options] - Configuration options for the field.
 * @returns {Function} - A decorator function.
 */
export function ParseField(options?: Partial<FieldMetaData>): Function {
    return function(target: InstanceType<ParseModelClass>, key: string, descriptor?: PropertyDescriptor){
        const addGetterSetter = options?.addGetterSetter ?? true;
        // if the property is not a function or a getter/setter
        if(descriptor === undefined && addGetterSetter){
            // we add the property the getter and setter to the prototype
            Reflect.defineProperty(target, key, {
                get: function(){
                    return this.get(key);
                },
                set: function(value){
                    this.set(key, value);
                },
                enumerable: true,
                configurable: true
            });
        }
        const existingFields:FieldMetaData[] = Reflect.getMetadata('ParseField', target.constructor) ?? [];
        const gridConfig = Object.assign({}, defaultConfig, options?.gridConfig);
        existingFields.push({
            type: options?.type ?? "string",
            label: options?.label ?? key,
            i18n: options?.i18n ?? key,
            gridConfig,
            addGetterSetter,
            link: options?.link
        });
        Reflect.defineMetadata('ParseField', existingFields, target.constructor);
    }
}

export interface ChainedFieldMetaData {
    type: "string" | "number" | "boolean" | "array"| "object" | "date"|  "pointer" | string;
    label: string;
    i18n: string;
    gridConfig: Partial<GridOptions>;
    addGetterSetter?: boolean;
    link?: ParseModelClass;
    linkFields?: {
        entityMeta: RegisteredModelData;
        fields: ChainedFieldMetaData[];
    };
}


/**
 * Resolve the fields of a ParseModelClass and its linked entities. This function traverses the linked entities
 * of a given model and returns a comprehensive list of fields, including those from linked entities.
 *
 * @param {ParseModelClass} model - The model whose fields are to be resolved.
 * @param {ParseModelClass[]} [seenClasses] - An array of models that have already been processed. Used to avoid infinite loops.
 * @returns {ChainedFieldMetaData[]} - An array of resolved fields, including fields from linked entities.
 *
 * @example
 * const resolvedFields = resolveChainedFields(MyModelClass);
 */
export function resolveChainedFields(
    model: ParseModelClass,
    seenClasses: ParseModelClass[] = []
): ChainedFieldMetaData[]{
    if (seenClasses.includes(model)) {
        return [];
    }
    const fields: ChainedFieldMetaData[] = Reflect.getMetadata('ParseField', model) ?? [];
    seenClasses.push(model);
    if (!fields){
        return [];
    }
    const resolvedFields: ChainedFieldMetaData[] = [];
    for (const field of fields) {
        if (field.type === 'pointer' || field.type === 'Pointer') {
            const linkedEntityClass = field.link;
            if (linkedEntityClass !== undefined) {
                const entityMeta = Reflect.getMetadata('ParseModel', linkedEntityClass);
                if (entityMeta !== undefined) {
                    const chainedFields = resolveChainedFields(linkedEntityClass, seenClasses.slice());
                    if (chainedFields.length === 0) { continue;}
                    resolvedFields.push({
                        ...field,
                        linkFields: {
                            entityMeta,
                            fields: chainedFields,
                        },
                    });
                }
            }
        } else {
            resolvedFields.push(field);
        }
    }
    return resolvedFields;
}
