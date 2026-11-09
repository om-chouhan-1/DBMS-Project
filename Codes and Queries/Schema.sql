CREATE TABLE Workspace
(
  workspace_id   int PRIMARY KEY ,
  workspace_name varchar
);

CREATE TABLE Users
(
  u_id   int  PRIMARY KEY,
  u_name    varchar  ,
  email        varchar  ,
  joining_time timestamp,
  user_wage    int      ,
  workspace_id int       NOT NULL,
  FOREIGN KEY (workspace_id) 
  REFERENCES Workspace (workspace_id)
);

CREATE TABLE Clients
(
  client_id    int PRIMARY KEY ,
  client_name  varchar NOT NULL,
  workspace_id int      NOT NULL,
  client_email varchar ,
  FOREIGN KEY (workspace_id) 
  REFERENCES Workspace(workspace_id)
);

CREATE TABLE Projects
(
  project_id              serial   PRIMARY KEY,
  project_name            varchar ,
  u_id                 int      NOT NULL,
  client_id               int  ,
  project_duration_worked interval,
  project_rate            int     ,
  FOREIGN KEY (client_id) REFERENCES Clients (client_id) ,
  FOREIGN KEY (u_id) REFERENCES Users (u_id) 
);


CREATE TABLE Tasks
(
  task_id         int       PRIMARY KEY ,
  task_name       varchar  ,
  project_id      integer   NOT NULL,
  task_duration   interval  NOT NULL,
  task_start_time timestamp NOT NULL,
  status          bool     ,
  
  FOREIGN KEY (project_id) REFERENCES Projects (project_id)
  
);


CREATE TABLE Entries (
    timer_start     timestamp NOT NULL,
    task_duration   interval  , 
    project_id      integer   NOT NULL,
    task_start_time timestamp ,
    timer_duration  interval  NOT NULL,
    task_id         int       NOT NULL,
    PRIMARY KEY (timer_start, timer_duration),
    FOREIGN KEY (project_id) REFERENCES Projects (project_id),
    FOREIGN KEY (task_id) 
    REFERENCES tasks (task_id)    
);
