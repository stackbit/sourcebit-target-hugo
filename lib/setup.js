const slugify = require("@sindresorhus/slugify");

// Find a value for each of the model's fields, to show as examples in the
// various questions.
function getExampleFieldValues(model, objects, maxLength = 60) {
  return objects.reduce((result, object) => {
    const { __metadata: meta, ...fields } = object;
    const isRightModel =
      meta &&
      meta.modelName === model.modelName &&
      meta.projectId === model.projectId &&
      meta.projectEnvironment === model.projectEnvironment &&
      meta.source === model.source;

    if (!isRightModel || !Array.isArray(model.fieldNames)) return result;

    model.fieldNames
      .filter(fieldName => result[fieldName] === undefined)
      .forEach(fieldName => {
        if (
          !["boolean", "number", "string"].includes(typeof fields[fieldName])
        ) {
          return;
        }

        const stringValue = fields[fieldName]
          .toString()
          .trim()
          .substring(0, maxLength);

        if (stringValue.length > 0) {
          result[fieldName] = stringValue;
        }
      });

    return result;
  }, {});
}

module.exports.getSetupForData = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  // Let's try to find a value for each of the model's fields, to show as
  // examples in the upcoming questions.
  const exampleFieldValues = getExampleFieldValues(model, data.objects);
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "format",
      message:
        "Choose a format for the file where the data objects will be stored:",
      choices: [
        {
          name: "JSON",
          value: "json"
        },
        {
          name: "YAML",
          value: "yml"
        }
      ]
    },
    {
      type: "list",
      name: "location",
      message: "Choose a location for the file:",
      choices: ({ format }) => [
        {
          name: `data/${model.modelName}.${format}`,
          value: {
            fileName: `data/${model.modelName}.${format}`
          }
        },
        {
          name: "It comes from one of the model fields",
          value: {
            fileNameField: true
          }
        },
        new inquirer.Separator(),
        {
          name: "Other",
          value: null
        }
      ]
    },
    {
      when: ({ location }) => location && location.fileNameField,
      type: "list",
      name: "location",
      message: "Select the field that contains the file location",
      choices: (model.fieldNames || []).map(fieldName => {
        const example = exampleFieldValues[fieldName]
          ? ` (e.g. ${exampleFieldValues[fieldName]})`
          : "";

        return {
          name: fieldName + example,
          short: fieldName,
          value: fieldName
        };
      }),
      filter: value => ({ fileNameField: value })
    },
    {
      when: ({ location }) => location === null,
      type: "input",
      name: "location",
      message: "Insert the location for the file",
      default: ({ format }) => `data/${model.modelName}.${format}`,
      filter: value => ({ fileName: value })
    },
    {
      type: "confirm",
      name: "isMultiple",
      message: `Do you want to include multiple entries in the same file? ${chalk.reset.dim(
        `If so, multiple entries of ${model.modelName} will be added as an array to the file; if not, only one entry will be kept.`
      )}`,
      default: true
    }
  ]);

  answers.__model = model;

  return {
    ...setupData,
    data: setupData.data.concat(answers)
  };
};

module.exports.getSetupForPage = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  const answers = {
    __model: model
  };

  // Let's try to find a value for each of the model's fields, to show as
  // examples in the upcoming questions.
  const exampleFieldValues = getExampleFieldValues(model, data.objects);

  const { pageType } = await inquirer.prompt([
    {
      type: "list",
      name: "pageType",
      message: "What is the type of this page?",
      choices: [
        {
          name: "Single page",
          value: "single"
        },
        { name: "Collection of entries", value: "collection" }
      ]
    }
  ]);

  answers.pageType = pageType;

  if (pageType === "single") {
    const { locationSource, locationValue } = await inquirer.prompt([
      {
        type: "list",
        name: "locationSource",
        message: "Choose the file path for this page",
        choices: [
          { name: "It comes from one of the page fields", value: "field" },
          {
            name: "It's a static value that I will specify",
            value: "static"
          }
        ]
      },
      {
        when: ({ locationSource }) => locationSource === "field",
        type: "list",
        name: "locationValue",
        message: "Choose the field that contains the path for this page:",
        choices: (model.fieldNames || []).map(fieldName => {
          const example = exampleFieldValues[fieldName]
            ? ` (e.g. ${slugify(exampleFieldValues[fieldName])})`
            : "";

          return {
            name: fieldName + example,
            short: fieldName,
            value: fieldName
          };
        })
      },
      {
        when: ({ locationSource }) => locationSource === "static",
        type: "input",
        name: "locationValue",
        message: "Choose a location for this page",
        default: `content/${model.modelName}.md`
      }
    ]);

    answers.location =
      locationSource === "static"
        ? { fileName: locationValue }
        : { fileNameField: locationValue };
  } else {
    const { directory, fileNameField } = await inquirer.prompt([
      {
        type: "list",
        name: "directory",
        message: "Choose the directory for this collection:",
        choices: [
          `content/${model.modelName}`,
          ,
          new inquirer.Separator(),
          { name: "Other", value: null }
        ].filter(Boolean)
      },
      {
        type: "input",
        name: "directory",
        when: ({ directory }) => directory === null,
        message: "Insert the location for this collection."
      },
      {
        type: "list",
        name: "fileNameField",
        message: "Choose a field to generate the file name from:",
        choices: (model.fieldNames || []).map(fieldName => {
          const example = exampleFieldValues[fieldName]
            ? ` (e.g. ${slugify(exampleFieldValues[fieldName])})`
            : "";

          return {
            name: fieldName + example,
            short: fieldName,
            value: fieldName
          };
        })
      }
    ]);

    answers.location = {
      directory,
      fileNameField
    };
  }

  const {
    addDateField,
    contentField,
    layout,
    layoutSource
  } = await inquirer.prompt([
    {
      type: "list",
      name: "layoutSource",
      message: "Choose the name of the template (i.e. layout) for this page.",
      choices: [
        { name: "It comes from one of the page fields", value: "field" },
        {
          name: "It's a static value that I will specify",
          value: "static"
        },
        new inquirer.Separator(),
        { name: "None", value: null }
      ]
    },
    {
      when: ({ layoutSource }) => layoutSource === "field",
      type: "list",
      name: "layout",
      message: "Select the layout field:",
      choices: (model.fieldNames || []).map(fieldName => {
        const example = exampleFieldValues[fieldName]
          ? ` (e.g. ${exampleFieldValues[fieldName]})`
          : "";

        return {
          name: fieldName + example,
          short: fieldName,
          value: fieldName
        };
      })
    },
    {
      when: ({ layoutSource }) => layoutSource === "static",
      type: "input",
      name: "layout",
      message: "Insert the layout name"
    },
    {
      type: "confirm",
      name: "addDateField",
      message: ({ directory }) =>
        `Do you want to add a 'date' field to the frontmatter? ${chalk.reset.dim(
          `(e.g. field: 2019-12-31)`
        )}`,
      default: true
    },
    {
      type: "list",
      name: "contentField",
      message: `Select the field that contains the page's content. ${chalk.reset.dim(
        "The other fields will be added to the frontmatter."
      )}`,
      choices: model.fieldNames
        .map(fieldName => {
          const example = exampleFieldValues[fieldName]
            ? ` (e.g. ${exampleFieldValues[fieldName]})`
            : "";

          return {
            name: fieldName + example,
            short: fieldName,
            value: fieldName
          };
        })
        .concat([new inquirer.Separator(), { name: "None", value: null }])
    }
  ]);

  answers.addDateField = addDateField;
  answers.contentField = contentField;
  answers.layout = layout;
  answers.layoutSource = layoutSource;

  return {
    ...setupData,
    pages: setupData.pages.concat(answers)
  };
};
