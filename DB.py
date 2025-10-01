from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase

# ===== Neo4j Aura 접속 설정 =====
URI = "neo4j+s://eff16eb9.databases.neo4j.io"
USERNAME = "neo4j"
PASSWORD = "_G6MBldCj1gGO_hWjogaMJpleFbjuSZKlMHohGucVrA"

class Neo4jConnector:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def fetch_nodes(self, activeView="default"):
        def safe_serialize(obj):
            try:
                d = dict(obj)
            except Exception:
                d = {}
            d["__labels"] = list(getattr(obj, "labels", []))
            d["__id"] = getattr(obj, "id", None)
            d["id"] = d.get("id", d.get("__id", None))
            return d

        with self.driver.session() as session:
            data = []

            # 뷰에 따라 쿼리 다르게
            if activeView == "externalInternal":
                query = "MATCH (n)-[r]->(t) WHERE n.project = 'internal' AND t.project = 'internal' RETURN n, r, t ORDER BY rand()"
            elif activeView in {"target", "active"}:
                query = "MATCH (n)-[r]->(t) RETURN n, r, t LIMIT 7"
            else:
                query = "MATCH (n)-[r]->(t) RETURN n, r, t LIMIT 7"

            result = session.run(query)
            for record in result:
                n_obj = record.get("n")
                t_obj = record.get("t")
                r_obj = record.get("r")

                source = safe_serialize(n_obj) if n_obj else {}
                target = safe_serialize(t_obj) if t_obj else {}
                edge = dict(r_obj) if r_obj else {}

                source_id = source.get("id") or getattr(n_obj, "id", None)
                target_id = target.get("id") or getattr(t_obj, "id", None)
                edge["sourceIP"] = source_id
                edge["targetIP"] = target_id
                source["id"] = source_id
                target["id"] = target_id

                data.append({
                    "src_IP": source,
                    "dst_IP": target,
                    "edge": edge,
                })

            return data


# ===== FastAPI 앱 정의 =====
app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/neo4j/nodes")
def get_nodes(activeView: str = "default"):
    neo4j_conn = Neo4jConnector(URI, USERNAME, PASSWORD)
    try:
        nodes = neo4j_conn.fetch_nodes(activeView)
        return JSONResponse(content=nodes)
    finally:
        neo4j_conn.close()


@app.get("/health")
def health_check():
    return {"status": "ok"}
