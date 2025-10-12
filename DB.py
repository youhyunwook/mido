from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, AuthError

# ===== Neo4j Aura 접속 설정 =====
URI = "neo4j+ssc://eff16eb9.databases.neo4j.io"
USERNAME = "neo4j"
PASSWORD = "_G6MBldCj1gGO_hWjogaMJpleFbjuSZKlMHohGucVrA"
DBNAME = "neo4j"
# ==================================

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _suggest_bolt(uri: str) -> str:
    """neo4j:// 계열 -> bolt:// 계열로 치환"""
    if uri.startswith("neo4j+s://"):
        return "bolt+s://" + uri[len("neo4j+s://"):]
    if uri.startswith("neo4j+ssc://"):
        return "bolt+ssc://" + uri[len("neo4j+ssc://"):]
    if uri.startswith("neo4j://"):
        return "bolt://" + uri[len("neo4j://"):]
    return uri


class Neo4jConnector:
    def __init__(self, uri: str, user: str, password: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = self._connect_driver()

    def _connect_driver(self):
        try:
            drv = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            drv.verify_connectivity()
            return drv
        except ServiceUnavailable:
            if self.uri.startswith(("neo4j://", "neo4j+s://", "neo4j+ssc://")):
                alt = _suggest_bolt(self.uri)
                drv = GraphDatabase.driver(alt, auth=(self.user, self.password))
                drv.verify_connectivity()
                self.uri = alt
                return drv
            raise
        except AuthError:
            raise

    def close(self):
        try:
            self.driver.close()
        except Exception:
            pass

    # ---------------- Core ----------------
    def fetch_nodes(self, activeView: str = "default", project: Optional[str] = None):
        """
        activeView:
          - default / physical / logical / persona
          - 3layer / cyber3layer / threelayer  ⟵ HOSTS + USES 둘 다
          - externalInternal / internalOnly / externalOnly
          - zone3 / zone3_strict
          - subnet:10.0.0.0/24
        """
        def safe_serialize(obj):
            try:
                d = dict(obj)
            except Exception:
                d = {}
            try:
                d["__labels"] = list(getattr(obj, "labels", []))
            except Exception:
                d["__labels"] = []
            try:
                d["__element_id"] = getattr(obj, "element_id", None)
            except Exception:
                d["__element_id"] = None
            if "id" not in d:
                d["id"] = d.get("__element_id") or d.get("ip") or d.get("name")
            # layer 힌트(라벨→소문자) 추가
            try:
                labs = [lab.lower() for lab in d.get("__labels", [])]
                for cand in ("physical", "logical", "persona"):
                    if cand in labs:
                        d["layer"] = cand
                        break
            except Exception:
                pass
            return d

        def pick_id(props, raw):
            return (
                props.get("id")
                or getattr(raw, "element_id", None)
                or props.get("ip")
                or props.get("name")
            )

        # === (A) 3계층: HOSTS + USES 모두 조회 ===
        if activeView in {"3layer", "cyber3layer", "threelayer"}:
            # project 필터는 선택적
            params = {"project": project} if project else {}
            query = """
            // Physical -> Logical
            CALL {
              WITH $project AS p
              MATCH p1 = (ph:Physical)-[r1:HOSTS]->(lg:Logical)
              WHERE p IS NULL
                 OR coalesce(ph.project,'') = p
                 OR coalesce(lg.project,'') = p
              RETURN p1 AS p, 'HOSTS' AS rel_type
              LIMIT 400
            }
            UNION ALL
            // Logical -> Persona
            CALL {
              WITH $project AS p
              MATCH p2 = (lg:Logical)-[r2:USES]->(pr:Persona)
              WHERE p IS NULL
                 OR coalesce(lg.project,'') = p
                 OR coalesce(pr.project,'') = p
              RETURN p2 AS p, 'USES' AS rel_type
              LIMIT 400
            }
            RETURN p, rel_type
            LIMIT 800
            """
            records = []
            with self.driver.session(database=DBNAME) as session:
                result = session.run(query, **params)
                for rec in result:
                    path = rec.get("p")
                    rel_type = rec.get("rel_type")
                    if not path or not path.relationships:
                        continue
                    n_obj = path.start_node
                    t_obj = path.end_node
                    r_obj = path.relationships[0]

                    src = safe_serialize(n_obj) if n_obj else {}
                    dst = safe_serialize(t_obj) if t_obj else {}
                    edge = dict(r_obj) if r_obj else {}
                    edge["rel"] = rel_type  # "HOSTS" | "USES"

                    sid = pick_id(src, n_obj)
                    tid = pick_id(dst, t_obj)
                    src["id"], dst["id"] = sid, tid
                    edge["sourceIP"], edge["targetIP"] = sid, tid

                    records.append({"src_IP": src, "dst_IP": dst, "edge": edge})
            return records

        # === (B) 그 외 뷰(기존) ===
        where_parts, params = [], {}
        order_clause = "ORDER BY rand()"
        limit_clause = "LIMIT 300"

        base = """
        MATCH (n:Device)-[r]->(t:Device)
        WITH n, r, t, toLower(coalesce(r.type, r.layer, TYPE(r))) AS _layer
        """

        if activeView in {"physical", "logical", "persona"}:
            params["rtype"] = activeView
            where_parts.append("_layer = $rtype")
        elif activeView == "externalInternal":
            where_parts.append("coalesce(n.project,'') <> coalesce(t.project,'')")
        elif activeView == "internalOnly":
            where_parts.append("coalesce(n.project,'') = 'internal' AND coalesce(t.project,'') = 'internal'")
        elif activeView == "externalOnly":
            where_parts.append("coalesce(n.project,'') = 'external' AND coalesce(t.project,'') = 'external'")
        elif activeView.startswith("zone"):
            strict = activeView.endswith("_strict")
            num_part = activeView.replace("zone", "").replace("_strict", "")
            try:
                params["zone"] = int(num_part)
                where_parts.append(
                    "n.zone = $zone AND t.zone = $zone" if strict else "n.zone = $zone OR t.zone = $zone"
                )
            except ValueError:
                pass
        elif activeView.startswith("subnet:"):
            subnet = activeView.split("subnet:", 1)[1].strip()
            if subnet:
                params["subnet"] = subnet
                where_parts.append("n.subnet = $subnet AND t.subnet = $subnet")

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        query = f"""
            {base}
            {where_clause}
            {order_clause}
            {limit_clause}
            RETURN n, r, t, _layer
        """

        records = []
        with self.driver.session(database=DBNAME) as session:
            result = session.run(query, **params)
            for rec in result:
                n_obj = rec.get("n")
                t_obj = rec.get("t")
                r_obj = rec.get("r")
                layer = rec.get("_layer")

                src = safe_serialize(n_obj) if n_obj else {}
                dst = safe_serialize(t_obj) if t_obj else {}
                edge = dict(r_obj) if r_obj else {}
                if layer:
                    edge["layer"] = layer

                sid = pick_id(src, n_obj)
                tid = pick_id(dst, t_obj)
                src["id"], dst["id"] = sid, tid
                edge["sourceIP"], edge["targetIP"] = sid, tid

                records.append({"src_IP": src, "dst_IP": dst, "edge": edge})
        return records


# ------------------ Routes ------------------

@app.get("/neo4j/nodes")
def get_nodes(activeView: str = "default", project: Optional[str] = None):
    neo4j = Neo4jConnector(URI, USERNAME, PASSWORD)
    try:
        data = neo4j.fetch_nodes(activeView, project)
        return JSONResponse(content=data)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=f"Neo4j auth failed: {e}")
    except ServiceUnavailable as e:
        raise HTTPException(status_code=503, detail=f"Neo4j routing/connection failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j error: {e}")
    finally:
        neo4j.close()


@app.get("/neo4j/ping")
def neo4j_ping():
    try:
        tmp = GraphDatabase.driver(URI, auth=(USERNAME, PASSWORD))
        tmp.verify_connectivity()
        with tmp.session(database=DBNAME) as s:
            s.run("RETURN 1 AS ok").single()
        tmp.close()
        return {"ok": True, "uri": URI, "db": DBNAME}
    except Exception as e:
        return JSONResponse(status_code=503, content={"ok": False, "uri": URI, "db": DBNAME, "error": str(e)})


@app.get("/health")
def health_check():
    return {"status": "ok"}
