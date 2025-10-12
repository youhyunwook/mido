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
    """neo4j:// 또는 neo4j+s:// 를 bolt:// / bolt+s:// 로 치환 (단일 서버 대비)"""
    if uri.startswith("neo4j+s://"):
        return "bolt+s://" + uri[len("neo4j+s://") :]
    if uri.startswith("neo4j://"):
        return "bolt://" + uri[len("neo4j://") :]
    return uri


class Neo4jConnector:
    def __init__(self, uri: str, user: str, password: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = self._connect_driver()

    def _connect_driver(self):
        # 1) 기본 연결 시도 + verify_connectivity()
        try:
            drv = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            drv.verify_connectivity()
            return drv
        except ServiceUnavailable:
            # 2) 라우팅 실패 시 bolt(+s)로 자동 재시도
            if self.uri.startswith("neo4j://") or self.uri.startswith("neo4j+s://"):
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

    # --------------
    # Core fetch
    # --------------
    def fetch_nodes(self, activeView: str = "default"):
        def safe_serialize(obj):
            try:
                d = dict(obj)
            except Exception:
                d = {}
            # labels / element id
            try:
                d["__labels"] = list(getattr(obj, "labels", []))
            except Exception:
                d["__labels"] = []
            try:
                d["__element_id"] = getattr(obj, "element_id", None)
            except Exception:
                d["__element_id"] = None
            # normalize id
            if "id" not in d:
                d["id"] = d.get("__element_id") or d.get("ip") or d.get("name")
            return d

        base_match = "MATCH (n:Device)-[r:CONNECTED]->(t:Device)"
        where_parts, params = [], {}
        order_clause = "ORDER BY rand()"
        limit_clause = "LIMIT 300"

        # ----- activeView 스위치 -----
        if activeView == "externalInternal":
            where_parts.append("n.project <> t.project")
        elif activeView == "internalOnly":
            where_parts.append("n.project = 'internal' AND t.project = 'internal'")
        elif activeView == "externalOnly":
            where_parts.append("n.project = 'external' AND t.project = 'external'")
        elif activeView in {"physical", "logical"}:
            params["rtype"] = activeView
            where_parts.append("coalesce(r.type, '') = $rtype")
        elif activeView.startswith("zone"):
            strict = activeView.endswith("_strict")
            num_part = activeView.replace("zone", "").replace("_strict", "")
            try:
                params["zone"] = int(num_part)
                if strict:
                    where_parts.append("n.zone = $zone AND t.zone = $zone")
                else:
                    where_parts.append("n.zone = $zone OR t.zone = $zone")
            except ValueError:
                pass
        elif activeView.startswith("subnet:"):
            subnet = activeView.split("subnet:", 1)[1].strip()
            if subnet:
                params["subnet"] = subnet
                where_parts.append("n.subnet = $subnet AND t.subnet = $subnet")

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        query = f"""
            {base_match}
            {where_clause}
            {order_clause}
            {limit_clause}
            RETURN n, r, t
        """

        records = []
        with self.driver.session(database=DBNAME) as session:
            result = session.run(query, **params)
            for rec in result:
                n_obj = rec.get("n")
                t_obj = rec.get("t")
                r_obj = rec.get("r")

                src = safe_serialize(n_obj) if n_obj else {}
                dst = safe_serialize(t_obj) if t_obj else {}
                edge = dict(r_obj) if r_obj else {}

                # choose stable ids for FG
                def pick_id(props, raw):
                    return (
                        props.get("id")
                        or getattr(raw, "element_id", None)
                        or props.get("ip")
                        or props.get("name")
                    )

                sid = pick_id(src, n_obj)
                tid = pick_id(dst, t_obj)
                src["id"], dst["id"] = sid, tid
                edge["sourceIP"], edge["targetIP"] = sid, tid

                records.append({"src_IP": src, "dst_IP": dst, "edge": edge})
        return records


@app.get("/neo4j/nodes")
def get_nodes(activeView: str = "default"):
    neo4j = Neo4jConnector(URI, USERNAME, PASSWORD)
    try:
        data = neo4j.fetch_nodes(activeView)
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
