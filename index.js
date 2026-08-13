import { db } from "./db/index.js";
import { todosTable } from "./db/schema.js";
import { eq, ilike } from "drizzle-orm";
import OpenAI from "openai";
import { GoogleGenAI } from '@google/genai';
import readlineSync from "readline-sync";

const client = new OpenAI();
// const client = new GoogleGenAI({});

async function getAllTodos() {
  const todos = await db.select().from(todosTable);
  return todos;
}

async function createTodo(todo) {
  const [result] = await db
    .insert(todosTable)
    .values({
      todo,
    })
    .returning({
      id: todosTable.id,
    });
  return result.id;
}
async function deleteTodoById(id) {
  await db.delete(todosTable).where(eq(todosTable.id, id));
}

async function searchTodo(search) {
  const todos = await db
    .select()
    .from(todosTable)
    .where(ilike(todosTable.todo, `%${search}%`));
  return todos;
}

const tools = {
  getAllTodos: getAllTodos,
  createTodo: createTodo,
  deleteTodoById: deleteTodoById,
  searchTodo: searchTodo,
};

const SYSTEM_PROMPT = `
You are an AI To-Do List Assistant with START,PLAN,ACTIONS ,Obseravtions and Output State.
wait for the user prompt and first PLAN using the availble tools.
after PLANNING, take the action with appropriate tools and wait to obeservation based on action.
once you get the observations, Returns the AI response based on Start prompt and observations

You can manage tasks by adding , viewing , updating and. deleting.
you must strictly follow the JSON output format.

Todo Schema : 
id : Int and primary key
todo : string
created_at: date time
updated_at : date time

Availble Tools : 
- getAllTodos(); Returns all the Todos from the Database.
- createTodo(todo: string) : Creates a new todo in the DB and take todo as string.
- deleteTodoById(id:string) :  deleted the todo by ID given in the DB
- searchTodo(query : string) : Searches for all todos matching the query string using the ilike in db.

 Example: 
 Start
{"type": "user" , "user":"add a task for shopping gorceries" }
{"type": "plan" , "plan":"I will try to get more context on what user need to shop" }
{"type": "output" , "output":"can u tell me what all items you want to shop for ?" }
{"type": "user" , "user":"I want to shop for milk, wheat and biscuits and snacks." }
{"type": "plan" , "plan":"I will use createTodo to create a new Todo in DB." }
{"type": "action" , "function":"createTodo", "input":"shoping for milk ,wheat and biscuits."}
{"type": "observation" , "observation":"2"}
{"type": "output" , "output":"Your todo has been added successfully" }

`;

const messages = [{ role: "system", content: SYSTEM_PROMPT }];

while (true) {
  const query = readlineSync.question(">>");
  const userMessage = {
    type: "user",
    user: query,
  };
  messages.push({ role: "user", content: JSON.stringify(userMessage) });

  while (true) {
    const chat = await client.chat.completions.create({
      model: "gpt-4o",
    //   model: "gemini-2.5-flash",
      messages: messages,
      response_format: { type: "json_object" },
    });
    const result = chat.choices[0].message.content;
    messages.push({ role: "assistant", content: result });

    const action = JSON.parse(result);

    if (action.type === "output") {
      console.log(`🤖:${action.output}`);
      break;
    } else if (action.type === "action") {
      const fn = tools[action.function];
      if (!fn) throw new Error("Invalid tool Call");
      const observation = await fn(action.input);

      const observationMessage = {
        type: "observation",
        observation: observation,
      };

      messages.push({
        role: "developer",
        content: JSON.stringify(observationMessage),
      });
    }
  }
}
