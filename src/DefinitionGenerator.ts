import { dereference } from '@jdw/jst';
import { resolve } from 'path';
import { NamedHttpApiEventAuthorizer } from 'serverless/aws';
import * as TJS from 'typescript-json-schema';
import * as uuid from 'uuid';
import {
  IDefinition,
  IDefinitionConfig,
  IEventDocumentation,
  IModel,
  IOperation,
  IParameterConfig,
  IServerlessFunctionConfig,
  IServerlessFunctionEvent,
  OperationConfig,
} from './types';
import { clone, isIterable, merge } from './utils';

export class DefinitionGenerator {
  // The OpenAPI version we currently validate against
  public version = '3.0.0';

  // Base configuration object
  public definition = <IDefinition>{
    openapi: this.version,
    components: {},
  };

  public config: IDefinitionConfig;

  /**
   * Constructor
   * @param config IDefinitionConfig
   */
  constructor(config: IDefinitionConfig) {
    this.config = clone(config);
  }

  public parse() {
    const { title = '', description = '', version = uuid.v4(), servers = [], models, security = [] } = this.config;

    merge(this.definition, {
      openapi: this.version,
      info: { title, description, version },
      servers,
      paths: {},
      components: {
        schemas: {},
        securitySchemes: security.reduce((result, s) => {
          const { authorizerName, name, ...rest } = s;
          result[name] = {
            name,
            ...rest,
          };
          return result;
        }, {}),
      },
    });

    if (isIterable(models)) {
      for (const model of models) {
        if (!model.schema && !model.tsSchema) {
          continue;
        }
        if (model.tsSchema) {
          const program = TJS.getProgramFromFiles([resolve(model.tsSchema.filePath)], {});
          model.schema = TJS.generateSchema(program, model.tsSchema.typeName, {
            noExtraProps: true,
            required: true,
          });
          delete model.tsSchema;
        }
        this.definition.components.schemas[model.name] = this.cleanSchema(dereference(model.schema));
      }
    }

    return this;
  }

  /**
   * Add Paths to OpenAPI Configuration from Serverless function documentation
   * @param config Add
   */
  public readFunctions(config: IServerlessFunctionConfig[]): void {
    // loop through function configurations
    for (const funcConfig of config) {
      // loop through http events
      for (const httpEvent of this.getHttpEvents(funcConfig.events)) {
        const httpEventConfig = httpEvent.http ?? httpEvent.httpApi;

        if (httpEventConfig.documentation) {
          // Build OpenAPI path configuration structure for each method
          const path = httpEventConfig.path.startsWith('/') ? httpEventConfig.path : `/${httpEventConfig.path}`;
          const pathConfig = {
            [path]: {
              [httpEventConfig.method.toLowerCase()]: this.getOperationFromConfig(
                httpEventConfig.documentation.operationId ?? funcConfig._functionName,
                httpEventConfig
              ),
            },
          };

          // merge path configuration into main configuration
          merge(this.definition.paths, pathConfig);
        }
      }
    }
  }

  /**
   * Cleans schema objects to make them OpenAPI compatible
   * @param schema JSON Schema Object
   */
  private cleanSchema(schema) {
    // Clone the schema for manipulation
    const cleanedSchema = clone(schema);

    // Strip $schema from schemas
    if (cleanedSchema.$schema) {
      delete cleanedSchema.$schema;
    }

    // Return the cleaned schema
    return cleanedSchema;
  }

  /**
   * Generate Operation objects from the Serverless Config.
   *
   * @link https://github.com/OAI/OpenAPI-Specification/blob/3.0.0/versions/3.0.0.md#operationObject
   * @param funcName
   * @param config
   */
  private getOperationFromConfig(funcName: string, config: OperationConfig): IOperation {
    const documentationConfig = config.documentation;
    const operationObj: IOperation = {
      operationId: funcName,
    };

    if (documentationConfig.summary) {
      operationObj.summary = documentationConfig.summary;
    }

    if (documentationConfig.description) {
      operationObj.description = documentationConfig.description;
    }

    if (documentationConfig.tags) {
      operationObj.tags = documentationConfig.tags;
    }

    if (documentationConfig.deprecated) {
      operationObj.deprecated = true;
    }

    if (documentationConfig.requestModels) {
      operationObj.requestBody = this.getRequestBodiesFromConfig(documentationConfig);
    }

    operationObj.parameters = this.getParametersFromConfig(documentationConfig);

    operationObj.responses = this.getResponsesFromConfig(documentationConfig);

    if (config.authorizer && this.config.security) {
      const authorizerName =
        typeof config.authorizer === 'string'
          ? config.authorizer
          : (config.authorizer as NamedHttpApiEventAuthorizer)?.name;
      const security = this.config.security.find((s) => s.authorizerName === authorizerName);
      if (security) {
        operationObj.security = [{ [security.name]: [] }];
      }
    }

    if (documentationConfig.security) {
      const securities = this.config.security.filter((s) => documentationConfig.security.includes(s.name));
      if (securities?.length > 0) {
        operationObj.security = securities.map((security) => ({ [security.name]: [] }));
      }
    }

    return operationObj;
  }

  /**
   * Derives Path, Query and Request header parameters from Serverless documentation
   * @param documentationConfig
   */
  private getParametersFromConfig(documentationConfig: IEventDocumentation): IParameterConfig[] {
    const parameters: IParameterConfig[] = [];

    // Build up parameters from configuration for each parameter type
    for (const type of ['path', 'query', 'header', 'cookie']) {
      let paramBlock: typeof documentationConfig['queryParams'];
      if (type === 'path' && documentationConfig.pathParams) {
        paramBlock = documentationConfig.pathParams;
      } else if (type === 'query' && documentationConfig.queryParams) {
        paramBlock = documentationConfig.queryParams;
      } else if (type === 'header' && documentationConfig.requestHeaders) {
        paramBlock = documentationConfig.requestHeaders;
      } else if (type === 'cookie' && documentationConfig.cookieParams) {
        paramBlock = documentationConfig.cookieParams;
      } else {
        continue;
      }

      // Loop through each parameter in a parameter block and add parameters to array
      for (const parameter of paramBlock) {
        const parameterConfig: IParameterConfig = {
          name: parameter.name,
          in: type,
          description: parameter.description || '',
          required: parameter.required || false, // Note: all path parameters must be required
        };

        // if type is path, then required must be true (@see OpenAPI 3.0-RC1)
        if (type === 'path') {
          parameterConfig.required = true;
        } else if (type === 'query') {
          parameterConfig.allowEmptyValue = parameter.allowEmptyValue || false; // OpenAPI default is false

          if ('allowReserved' in parameter) {
            parameterConfig.allowReserved = parameter.allowReserved || false;
          }
        }

        if ('deprecated' in parameter) {
          parameterConfig.deprecated = parameter.deprecated;
        }

        if ('style' in parameter) {
          parameterConfig.style = parameter.style;

          parameterConfig.explode = parameter.explode ? parameter.explode : parameter.style === 'form';
        }

        if (parameter.schema) {
          parameterConfig.schema = this.cleanSchema(parameter.schema);
        }

        if (parameter.examples && Array.isArray(parameter.examples)) {
          parameterConfig.examples = parameter.examples;
        }

        if (parameter.content) {
          parameterConfig.content = parameter.content;
        }

        parameters.push(parameterConfig);
      }
    }

    return parameters;
  }

  /**
   * Derives request body schemas from event documentation configuration
   * @param documentationConfig
   */
  private getRequestBodiesFromConfig(documentationConfig: IEventDocumentation) {
    const requestBodies = {};

    if (!documentationConfig.requestModels) {
      throw new Error(`Required requestModels in: ${JSON.stringify(documentationConfig, null, 2)}`);
    }

    // Does this event have a request model?
    if (documentationConfig.requestModels) {
      // For each request model type (Sorted by "Content-Type")
      for (const requestModelType of Object.keys(documentationConfig.requestModels)) {
        // get schema reference information
        const requestModel = this.config.models
          .filter((model) => model.name === documentationConfig.requestModels[requestModelType])
          .pop();

        if (requestModel) {
          const reqModelConfig = {
            schema: {
              $ref: `#/components/schemas/${documentationConfig.requestModels[requestModelType]}`,
            },
          };

          this.attachExamples(requestModel, reqModelConfig);

          const reqBodyConfig: { content: object; description?: string } = {
            content: {
              [requestModelType]: reqModelConfig,
            },
          };

          if (documentationConfig.requestBody && 'description' in documentationConfig.requestBody) {
            reqBodyConfig.description = documentationConfig.requestBody.description;
          }

          merge(requestBodies, reqBodyConfig);
        }
      }
    }

    return requestBodies;
  }

  private attachExamples(target: IModel, config) {
    if (target.examples) {
      merge(config, { examples: clone(target.examples) });
    }
  }

  /**
   * Gets response bodies from documentation config
   * @param documentationConfig
   */
  private getResponsesFromConfig(documentationConfig: IEventDocumentation) {
    const responses = {};
    if (documentationConfig.methodResponses) {
      for (const response of documentationConfig.methodResponses) {
        const methodResponseConfig: { description: any; content: object; headers?: object } = {
          description:
            response.responseBody && 'description' in response.responseBody
              ? response.responseBody.description
              : `Status ${response.statusCode} Response`,
          content: this.getResponseContent(response.responseModels),
        };

        if (response.responseHeaders) {
          methodResponseConfig.headers = {};
          for (const header of response.responseHeaders) {
            methodResponseConfig.headers[header.name] = {
              description: header.description || `${header.name} header`,
            };
            if (header.schema) {
              methodResponseConfig.headers[header.name].schema = this.cleanSchema(header.schema);
            }
          }
        }

        merge(responses, {
          [response.statusCode]: methodResponseConfig,
        });
      }
    }

    return responses;
  }

  private getResponseContent(response: Record<string, string>) {
    const content = {};

    for (const responseKey of Object.keys(response)) {
      const responseModel = this.config.models.find((model) => model.name === response[responseKey]);

      if (responseModel) {
        const resModelConfig = {
          schema: {
            $ref: `#/components/schemas/${response[responseKey]}`,
          },
        };

        this.attachExamples(responseModel, resModelConfig);

        merge(content, { [responseKey]: resModelConfig });
      }
    }

    return content;
  }

  private getHttpEvents(funcConfig: IServerlessFunctionEvent[]) {
    return funcConfig.filter((event) => (event.http || event.httpApi ? true : false));
  }
}
