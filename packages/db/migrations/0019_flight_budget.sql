-- A planned flight carries its total budget, so the Planner can forecast it.
alter table flight add column budget numeric not null default 0;
